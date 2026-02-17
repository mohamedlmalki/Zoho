// server/billing-custom-handler.js

const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

// --- UPDATED SLEEP WITH COUNTDOWN EMITTER ---
const interruptibleSleep = (ms, jobId, socket, profileName) => {
    return new Promise(resolve => {
        if (ms <= 0) return resolve();
        
        let remaining = ms;
        const intervalTime = 1000;
        
        // Emit initial full time
        if (socket && profileName) {
            socket.emit('jobCountdown', { profileName, seconds: Math.ceil(remaining / 1000) });
        }

        const timerId = setInterval(() => {
            // Check if job stopped/killed
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                clearInterval(timerId);
                return resolve();
            }

            remaining -= intervalTime;

            // Emit countdown update
            if (socket && profileName && remaining > 0) {
                socket.emit('jobCountdown', { profileName, seconds: Math.ceil(remaining / 1000) });
            }

            if (remaining <= 0) {
                clearInterval(timerId);
                // Clear countdown on finish
                if (socket && profileName) {
                    socket.emit('jobCountdown', { profileName, seconds: 0 });
                }
                resolve();
            }
        }, intervalTime);
    });
};

function checkAutoPause(job, profileName, socket) {
    if (job && job.stopAfterFailures > 0 && job.consecutiveFailures >= job.stopAfterFailures) {
        if (job.status !== 'paused') {
            job.status = 'paused';
            socket.emit('jobPaused', { 
                profileName: profileName, 
                jobType: 'billing-custom', 
                reason: `Auto-paused after ${job.consecutiveFailures} consecutive failures.` 
            });
        }
    }
}

// --- FIELD FETCHING ---
const handleFetchBillingModuleFields = async (socket, data) => {
    const { activeProfile, moduleApiName } = data;
    let fieldsFound = [];
    let logs = [];

    const log = (msg) => {
        console.log(`[Billing Field Fetch]: ${msg}`);
        logs.push(msg);
    };

    log(`Start fetching fields for module: '${moduleApiName}'`);

    try {
        if (!activeProfile || !activeProfile.billing) throw new Error('Billing profile configuration is missing.');

        // Strategy 1: Standard Settings
        try {
            const res1 = await makeApiCall('get', `/settings/modules/${moduleApiName}/fields`, null, activeProfile, 'billing');
            if (res1.data && (res1.data.fields || res1.data.custom_fields)) {
                fieldsFound = res1.data.fields || res1.data.custom_fields;
            }
        } catch (e) {}

        // Strategy 2: Entity Fields
        if (fieldsFound.length === 0) {
            try {
                const res2 = await makeApiCall('get', `/settings/fields?entity=${moduleApiName}`, null, activeProfile, 'billing');
                if (res2.data && res2.data.fields) fieldsFound = res2.data.fields;
            } catch (e) {}
        }

        // Strategy 3: Custom Modules List (Billing sometimes uses different structure)
        if (fieldsFound.length === 0) {
            try {
                // Try fetching record to infer structure if metadata endpoint fails
                const endpoint = moduleApiName.startsWith('/') ? `${moduleApiName}?per_page=1` : `/${moduleApiName}?per_page=1`;
                const listRes = await makeApiCall('get', endpoint, null, activeProfile, 'billing');
                const responseData = listRes.data;
                let records = [];
                if (responseData[moduleApiName]) records = responseData[moduleApiName];
                else if (Array.isArray(responseData)) records = responseData;
                else {
                    const arrayKey = Object.keys(responseData).find(k => Array.isArray(responseData[k]));
                    if (arrayKey) records = responseData[arrayKey];
                }

                if (records.length > 0) {
                    const sample = records[0];
                    fieldsFound = Object.keys(sample).map(key => ({
                        label: key, api_name: key, data_type: 'text', is_mandatory: false
                    }));
                    const systemFields = ['created_time', 'last_modified_time', 'created_by', 'updated_by', 'status_formatted', 'currency_symbol'];
                    fieldsFound = fieldsFound.filter(f => !systemFields.includes(f.api_name) && !f.api_name.endsWith('_id'));
                }
            } catch (e) {}
        }

        if (fieldsFound.length > 0) {
            const cleanFields = fieldsFound.map(f => ({
                label: f.label || f.field_name_formatted || f.field_name || f.api_name,
                api_name: f.api_name || f.field_name || f.label,
                data_type: f.data_type || 'text',
                is_mandatory: f.is_mandatory || false
            }));
            socket.emit('billingModuleFieldsResult', { success: true, fields: cleanFields });
        } else {
            socket.emit('billingModuleFieldsResult', { success: false, error: `Could not fetch fields.`, debug_logs: logs });
        }

    } catch (error) {
        const { message } = parseError(error);
        socket.emit('billingModuleFieldsResult', { success: false, error: message });
    }
};

const handleStartBulkBillingCustomJob = async (socket, data) => {
    const { 
        moduleApiName, bulkData, staticData, bulkField, 
        delay, selectedProfileName, activeProfile, stopAfterFailures,
        concurrency = 1,
        processedIds // <--- ADDED: Resume Support
    } = data;

    const jobId = createJobId(socket.id, selectedProfileName, 'billing-custom');
    
    const batchSize = Math.max(1, Number(concurrency) || 1);
    const delayMs = (Number(delay) || 0) * 1000;
    const failureLimit = Number(stopAfterFailures) || 0;

    activeJobs[jobId] = { 
        status: 'running', 
        consecutiveFailures: 0,
        stopAfterFailures: failureLimit
    };

    // --- RESUME LOGIC ---
    const processedSet = new Set(processedIds || []);

    try {
        let rows = [];

        if (bulkField && typeof bulkData === 'string') {
             const lines = bulkData.split('\n').filter(line => line.trim() !== '');
             rows = lines.map(line => ({ ...staticData, [bulkField]: line.trim() }));
        } else {
             rows = JSON.parse(bulkData);
        }

        if (!Array.isArray(rows) || rows.length === 0) throw new Error("Invalid bulk data or empty list.");

        // --- CONCURRENCY LOOP ---
        for (let i = 0; i < rows.length; i += batchSize) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') await new Promise(r => setTimeout(r, 500));

            const batch = rows.slice(i, i + batchSize);
            
            if (i > 0 && delayMs > 0) {
                await interruptibleSleep(delayMs, jobId, socket, selectedProfileName);
            }

            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            // Process Batch
            const promises = batch.map(async (row, index) => {
                const rowNumber = i + index + 1;
                const payload = { ...staticData, ...row };
                
                Object.keys(payload).forEach(k => (payload[k] === "" || payload[k] == null) && delete payload[k]);

                let identifier = 
                    payload.email || 
                    payload.contact_email || 
                    payload.vendor_email || 
                    payload.name || 
                    payload.customer_name || 
                    payload.item_name;

                if (!identifier && bulkField && payload[bulkField] && typeof payload[bulkField] === 'string') {
                    identifier = payload[bulkField];
                }
                if (!identifier) identifier = `Row ${rowNumber}`;

                // --- SKIP IF ALREADY PROCESSED ---
                if (processedSet.has(identifier)) {
                    return;
                }

                socket.emit('billingCustomModuleResult', {
                    rowNumber, identifier, stage: 'processing', details: 'Sending...', success: false, profileName: selectedProfileName
                });

                try {
                    const endpoint = moduleApiName.startsWith('/') ? moduleApiName : `/${moduleApiName}`;
                    const response = await makeApiCall('post', endpoint, payload, activeProfile, 'billing');
                    
                    if (activeJobs[jobId]) {
                        if (activeJobs[jobId].status !== 'paused') {
                            activeJobs[jobId].consecutiveFailures = 0;
                        }
                    }

                    socket.emit('billingCustomModuleResult', {
                        rowNumber, identifier, stage: 'complete', success: true, details: 'Created.', response: response.data, profileName: selectedProfileName
                    });
                } catch (error) {
                    const { message, fullResponse } = parseError(error);
                    
                    if (activeJobs[jobId]) {
                        activeJobs[jobId].consecutiveFailures++;
                        checkAutoPause(activeJobs[jobId], selectedProfileName, socket);
                    }
                    
                    socket.emit('billingCustomModuleResult', {
                        rowNumber, identifier, stage: 'complete', success: false, details: message, fullResponse: fullResponse, profileName: selectedProfileName
                    });
                }
            });

            await Promise.all(promises);
        }

    } catch (error) {
        socket.emit('bulkError', { message: error.message, profileName: selectedProfileName, jobType: 'billing-custom' });
    } finally {
        if (activeJobs[jobId]) {
            socket.emit('jobCountdown', { profileName: selectedProfileName, seconds: 0 });
            if (activeJobs[jobId].status === 'ended') socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'billing-custom' });
            else socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'billing-custom' });
            delete activeJobs[jobId];
        }
    }
};

module.exports = { setActiveJobs, handleFetchBillingModuleFields, handleStartBulkBillingCustomJob };