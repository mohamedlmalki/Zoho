// server/custom-module-handler.js

const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

// Helper sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const handleFetchModuleFields = async (socket, data) => {
    try {
        const { activeProfile, moduleApiName } = data;
        if (!activeProfile || !moduleApiName) throw new Error('Profile or Module Name missing.');

        console.log(`[INFO] Fetching fields for: ${moduleApiName}`);
        let fieldsFound = [];

        // STRATEGY 1: Standard
        try {
            const url = `/v1/settings/fields?module=${moduleApiName}`;
            const response = await makeApiCall('get', url, null, activeProfile, 'inventory');
            if (response.data && (response.data.fields || response.data.data)) fieldsFound = response.data.fields || response.data.data;
        } catch (e) { }

        // STRATEGY 2: Entity
        if (fieldsFound.length === 0) {
            try {
                const url = `/v1/settings/fields?entity=${moduleApiName}`;
                const response = await makeApiCall('get', url, null, activeProfile, 'inventory');
                if (response.data && (response.data.fields || response.data.data)) fieldsFound = response.data.fields || response.data.data;
            } catch (e) { }
        }

        // STRATEGY 3: Layouts (Very common for custom modules)
        if (fieldsFound.length === 0) {
            try {
                const url = `/v1/settings/layouts?module=${moduleApiName}`;
                const response = await makeApiCall('get', url, null, activeProfile, 'inventory');
                if (response.data && response.data.layouts && response.data.layouts.length > 0) {
                    const layoutId = response.data.layouts[0].layout_id;
                    const layoutDetails = await makeApiCall('get', `/v1/settings/layouts/${layoutId}`, null, activeProfile, 'inventory');
                    if (layoutDetails.data.layout && layoutDetails.data.layout.sections) {
                        layoutDetails.data.layout.sections.forEach(section => {
                            if (section.fields) fieldsFound = [...fieldsFound, ...section.fields];
                        });
                    }
                }
            } catch (e) { }
        }

        const simplifiedFields = fieldsFound.map(f => ({
            label: f.label || f.field_name_formatted || f.field_name,
            api_name: f.api_name || f.field_name || f.label,
            data_type: f.data_type || 'text',
            is_mandatory: f.is_mandatory || false,
            values: f.values // for dropdowns
        }));

        if (simplifiedFields.length > 0) {
            socket.emit('moduleFieldsResult', { success: true, fields: simplifiedFields });
        } else {
            socket.emit('moduleFieldsResult', { success: false, error: 'No fields found. Check module API name.' });
        }

    } catch (error) {
        socket.emit('moduleFieldsResult', { success: false, error: error.message });
    }
};

const handleStartBulkCustomJob = async (socket, data) => {
    const { 
        moduleApiName, bulkData, staticData, bulkField, 
        delay, selectedProfileName, activeProfile, 
        concurrency, stopAfterFailures,
        processedIds // <--- ADDED: Resume Support
    } = data;

    const jobId = createJobId(socket.id, selectedProfileName, moduleApiName);
    const workerCount = Number(concurrency) || 1;
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
        try {
            rows = JSON.parse(bulkData);
            if (!Array.isArray(rows)) throw new Error("Bulk Data is not an array");
        } catch (e) {
            // Fallback for simple list (if bulkField provided)
            if (bulkField) {
                rows = bulkData.split('\n').filter(x => x.trim()).map(val => ({ [bulkField]: val.trim() }));
            } else {
                throw new Error("Invalid JSON and no bulk field selected.");
            }
        }

        let currentIndex = 0;

        const worker = async (workerId) => {
            while (currentIndex < rows.length) {
                if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
                
                // Pause Logic
                while (activeJobs[jobId]?.status === 'paused') {
                    await sleep(1000);
                    if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') return;
                }

                // Grab next item
                const index = currentIndex++;
                if (index >= rows.length) break;

                const row = rows[index];
                const rowNumber = index + 1;
                
                // Merge static data
                const payload = { ...staticData, ...row };
                
                // Determine identifier
                let identifier = payload[bulkField] || payload.name || payload.email || `Row ${rowNumber}`;
                if (typeof identifier === 'object') identifier = JSON.stringify(identifier);

                // --- SKIP IF ALREADY PROCESSED ---
                if (processedSet.has(identifier)) {
                    continue;
                }

                socket.emit('customModuleResult', {
                    rowNumber, identifier, stage: 'processing', details: 'Processing...', profileName: selectedProfileName
                });

                try {
                    const url = `/${moduleApiName}`; // Inventory usually implies /v1 internally via wrapper, or pass full path
                    // Inventory calls often need the module name in the URL directly e.g. /v1/packages
                    // If it is a true "Custom Module", it might be /v1/custom_modules_api_name
                    
                    const response = await makeApiCall('post', url, payload, activeProfile, 'inventory');
                    
                    if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;

                    socket.emit('customModuleResult', {
                        rowNumber, identifier, stage: 'complete', success: true, 
                        details: 'Created', response: response.data, profileName: selectedProfileName
                    });

                } catch (error) {
                    const { message, fullResponse } = parseError(error);
                    
                    if (activeJobs[jobId]) {
                        activeJobs[jobId].consecutiveFailures++;
                        
                        // Check Stop condition
                        if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                            activeJobs[jobId].status = 'paused';
                            socket.emit('jobPaused', { 
                                profileName: selectedProfileName, 
                                jobType: moduleApiName,
                                reason: `Auto-paused after ${activeJobs[jobId].consecutiveFailures} consecutive failures.` 
                            });
                        }
                    }

                    socket.emit('customModuleResult', {
                        rowNumber, identifier, stage: 'complete', success: false, 
                        details: message, fullResponse, profileName: selectedProfileName
                    });
                }

                if (delay > 0) await sleep(delay * 1000);
            }
        };

        console.log(`[INFO] Starting job with ${workerCount} workers. StopAfter: ${stopAfterFailures}`);
        
        // Start Workers
        const workers = [];
        for (let w = 0; w < workerCount; w++) {
            workers.push(worker(w));
        }

        await Promise.all(workers);

    } catch (err) {
        socket.emit('bulkError', { message: err.message, profileName: selectedProfileName, jobType: moduleApiName });
    } finally {
         if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: moduleApiName });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: moduleApiName });
            }
            delete activeJobs[jobId];
        }
    }
};

module.exports = {
    setActiveJobs,
    handleFetchModuleFields,
    handleStartBulkCustomJob
};