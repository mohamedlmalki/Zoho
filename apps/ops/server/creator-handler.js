// --- FILE: apps/ops/server/creator-handler.js ---

const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

const interruptibleSleep = (ms, jobId) => {
    return new Promise(resolve => {
        if (ms <= 0) return resolve();
        const interval = 100;
        let elapsed = 0;
        const timerId = setInterval(() => {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                clearInterval(timerId);
                return resolve();
            }
            elapsed += interval;
            if (elapsed >= ms) {
                clearInterval(timerId);
                resolve();
            }
        }, interval);
    });
};

const getCreatorApiUrl = (activeProfile, path) => {
    const { ownerName, appName } = activeProfile.creator;
    return `/data/${ownerName}/${appName}${path}`;
};

// --- 🔹 NEW HELPER: Get Field Map (API Name -> Label) ---
async function getFieldMap(activeProfile, formLinkName) {
    console.log(`[CREATOR LOG] Fetching field map for form: ${formLinkName}`);
    try {
        const { ownerName, appName } = activeProfile.creator;
        // Using "meta" API to get fields
        const url = `/meta/${ownerName}/${appName}/form/${formLinkName}/fields`;
        
        // Pass skipWorkerLog=true to avoid clogging logs with read operations
        const response = await makeApiCall('get', url, null, activeProfile, 'creator', {}, null, true);
        
        const map = {};
        if (response.data && response.data.fields) {
            response.data.fields.forEach(field => {
                if (field.link_name && field.display_name) {
                    map[field.link_name] = field.display_name;
                    // Store lowercase too just in case
                    map[field.link_name.toLowerCase()] = field.display_name;
                }
            });
        }
        console.log(`[CREATOR LOG] Field Map built. Keys: ${Object.keys(map).length}`);
        return map;
    } catch (e) {
        console.error("[CREATOR LOG] Failed to fetch field map:", e.message);
        return {}; // Return empty map on failure (logs will show API names)
    }
}

const handleGetForms = async (socket, data) => {
    try {
        const { activeProfile } = data;
        if (!activeProfile || !activeProfile.creator) throw new Error('Creator profile not configured.');
        
        const { ownerName, appName } = activeProfile.creator;
        const url = `/meta/${ownerName}/${appName}/forms`;
        
        const response = await makeApiCall('get', url, null, activeProfile, 'creator');
        
        if (response.data && response.data.forms) {
            socket.emit('creatorFormsResult', { success: true, forms: response.data.forms });
        } else {
            throw new Error('No forms found or invalid response structure.');
        }
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('creatorFormsResult', { success: false, error: message, fullResponse });
    }
};

const handleGetFormComponents = async (socket, data) => {
    try {
        const { activeProfile, formLinkName } = data;
        if (!activeProfile || !activeProfile.creator) throw new Error('Creator profile not configured.');
        if (!formLinkName) throw new Error('Form Link Name is required.');
        
        const { ownerName, appName } = activeProfile.creator;
        const url = `/meta/${ownerName}/${appName}/form/${formLinkName}/fields`;
        
        const response = await makeApiCall('get', url, null, activeProfile, 'creator');
        
        if (response.data && response.data.fields) {
            socket.emit('creatorFormComponentsResult', { success: true, fields: response.data.fields, formLinkName });
        } else {
            throw new Error('No fields found or invalid response structure.');
        }
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('creatorFormComponentsResult', { success: false, error: message, fullResponse });
    }
};

const handleInsertCreatorRecord = async (socket, data) => {
    try {
        const { activeProfile, formLinkName, formData } = data;
        if (!activeProfile || !activeProfile.creator) throw new Error('Creator profile not configured.');
        
        const url = getCreatorApiUrl(activeProfile, `/form/${formLinkName}`);
        const postData = { data: { ...formData } }; 
        
        // Fetch map for single insert to make log pretty
        const fieldMap = await getFieldMap(activeProfile, formLinkName);
            
        // Pass fieldMap as logExtras
        const response = await makeApiCall('post', url, postData, activeProfile, 'creator', {}, fieldMap);
        
        socket.emit('insertCreatorRecordResult', { success: true, data: response.data });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('insertCreatorRecordResult', { success: false, error: message, fullResponse });
    }
};

const handleStartBulkInsertCreatorRecords = async (socket, data) => {
    const { 
        selectedProfileName, 
        activeProfile,
        selectedFormLinkName,
        bulkPrimaryField,
        bulkPrimaryValues,
        bulkDefaultData,
        bulkDelay,
        stopAfterFailures = 0 
    } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'creator');
    activeJobs[jobId] = { status: 'running', consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures) };

    try {
        if (!activeProfile || !activeProfile.creator) throw new Error('Creator profile not configured.');
        if (!selectedFormLinkName || !bulkPrimaryField || !bulkPrimaryValues) throw new Error('Form fields missing.');

        const url = getCreatorApiUrl(activeProfile, `/form/${selectedFormLinkName}`);
        
        // 🔹 FETCH MAP ONCE FOR BULK JOB
        const fieldMap = await getFieldMap(activeProfile, selectedFormLinkName);

        for (let i = 0; i < bulkPrimaryValues.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (activeJobs[jobId].stopAfterFailures > 0 && 
                activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                 if (activeJobs[jobId].status !== 'paused') {
                     activeJobs[jobId].status = 'paused';
                     socket.emit('jobPaused', { profileName: selectedProfileName, reason: `Paused automatically after failures.` });
                 }
                 while (activeJobs[jobId]?.status === 'paused') { await new Promise(resolve => setTimeout(resolve, 500)); }
            }

            if (i > 0 && bulkDelay > 0) await interruptibleSleep(bulkDelay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const primaryValue = bulkPrimaryValues[i];
            if (!primaryValue.trim()) continue;
            
            const recordData = { 
                ...bulkDefaultData,
                [bulkPrimaryField]: primaryValue
            };
            const postData = { data: recordData };

            try {
                // 🔹 PASS FIELD MAP HERE
                const response = await makeApiCall('post', url, postData, activeProfile, 'creator', {}, fieldMap);
                
                let details = "Record added successfully.";
                if (response.data.result && Array.isArray(response.data.result) && response.data.result[0]) {
                    const resultData = response.data.result[0];
                    if (resultData.code === 3000) details = `Record Added. ID: ${resultData.data.ID}`;
                    else throw new Error(resultData.message || "Unknown error.");
                } else if (response.data.code && response.data.code !== 3000) {
                     throw new Error(response.data.message || "Unknown error.");
                }

                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;

                socket.emit('creatorResult', { 
                    primaryValue, 
                    success: true, 
                    details: details,
                    fullResponse: response.data,
                    profileName: selectedProfileName
                });

            } catch (error) {
                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures++;
                const { message, fullResponse } = parseError(error);
                socket.emit('creatorResult', { 
                    primaryValue, 
                    success: false, 
                    error: message, 
                    fullResponse, 
                    profileName: selectedProfileName 
                });
            }
        }
    } catch (error) {
        socket.emit('bulkError', { message: error.message, profileName: selectedProfileName, jobType: 'creator' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            socket.emit(finalStatus === 'ended' ? 'bulkEnded' : 'bulkComplete', { profileName: selectedProfileName, jobType: 'creator' });
            delete activeJobs[jobId];
        }
    }
};

module.exports = {
    setActiveJobs,
    handleGetForms,
    handleGetFormComponents,
    handleInsertCreatorRecord,
    handleStartBulkInsertCreatorRecords,
};