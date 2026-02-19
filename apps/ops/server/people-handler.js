// --- FILE: apps/ops/server/people-handler.js ---

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

// --- 🔹 NEW HELPER: Get Field Map (API Name -> Label) ---
// This uses YOUR working URL structure to fetch labels for the logs
async function getFieldMap(activeProfile, formName) {
    try {
        // Using the path from your "working" code (API 2)
        const url = `/people/api/forms/${formName}/components`;
        
        // Pass skipWorkerLog=true so we don't spam logs
        const response = await makeApiCall('get', url, null, activeProfile, 'people', {}, null, true);
        
        const map = {};
        const result = response.data?.response?.result;
        
        if (result && Array.isArray(result)) {
            result.forEach(field => {
                if (field.labelName && field.compName) {
                    map[field.labelName] = field.compName;
                    map[field.labelName.toLowerCase()] = field.compName;
                }
            });
        }
        return map;
    } catch (e) {
        return {}; 
    }
}

// --- API 1: Get all forms ---
const handleGetForms = async (socket, data) => {
    try {
        const { activeProfile } = data;
        // 🔹 KEPT YOUR URL
        const response = await makeApiCall('get', '/people/api/forms', null, activeProfile, 'people');
        
        if (response.data?.response?.status === 0) {
            socket.emit('peopleFormsResult', { 
                success: true, 
                forms: response.data.response.result 
            });
        } else {
            const message = response.data?.response?.message || 'Failed to fetch forms.';
            socket.emit('peopleFormsResult', { success: false, error: message });
        }
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('peopleFormsResult', { success: false, error: message });
    }
};

// --- API 2: Get fields for a specific form ---
const handleGetFormComponents = async (socket, data) => {
    try {
        const { activeProfile, formLinkName } = data;
        if (!formLinkName) {
            throw new Error("formLinkName is required.");
        }
        
        // 🔹 KEPT YOUR URL
        const url = `/people/api/forms/${formLinkName}/components`;
        const response = await makeApiCall('get', url, null, activeProfile, 'people');
        
        if (response.data?.response?.status === 0) {
            socket.emit('peopleFormComponentsResult', { 
                success: true, 
                components: response.data.response.result 
            });
        } else {
            const message = response.data?.response?.message || 'Failed to fetch form components.';
            socket.emit('peopleFormComponentsResult', { success: false, error: message });
        }
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('peopleFormComponentsResult', { success: false, error: message });
    }
};

// --- API 3: Insert a single record into a form ---
const handleInsertRecord = async (socket, data) => {
    try {
        const { activeProfile, formLinkName, inputData } = data;
        if (!formLinkName || !inputData) {
            throw new Error("formLinkName and inputData are required.");
        }
        
        // 🔹 KEPT YOUR URL
        const url = `/api/forms/json/${formLinkName}/insertRecord`;
        
        const params = new URLSearchParams();
        params.append('inputData', JSON.stringify(inputData));

        // 🔹 WORKER LOGIC: Fetch Map
        const fieldMap = await getFieldMap(activeProfile, formLinkName);

        // 🔹 WORKER LOGIC: Pass fieldMap as last argument
        const response = await makeApiCall('post', url, params, activeProfile, 'people', {}, fieldMap);

        if (response.data?.response?.status === 0) {
            socket.emit('peopleInsertRecordResult', { 
                success: true, 
                result: response.data.response.result 
            });
        } else {
            const message = response.data?.response?.message || 'Failed to insert record.';
            socket.emit('peopleInsertRecordResult', { success: false, error: message });
        }
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        const detailedError = fullResponse?.response?.errors?.error?.message || message;
        socket.emit('peopleInsertRecordResult', { success: false, error: detailedError });
    }
};

// --- API 4: Start Bulk Insert Records ---
const handleStartBulkInsertRecords = async (socket, data) => {
    const { 
        primaryFieldValues, 
        defaultData, 
        delay, 
        selectedProfileName, 
        activeProfile,
        formLinkName,
        primaryFieldLabelName,
        stopAfterFailures = 0 
    } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'people');
    activeJobs[jobId] = { status: 'running' };

    let consecutiveFailures = 0; 

    try {
        if (!activeProfile || !activeProfile.people) {
            throw new Error('Zoho People profile configuration is missing.');
        }
        if (!formLinkName || !primaryFieldLabelName || !primaryFieldValues) {
            throw new Error('Missing formLinkName, primaryFieldLabelName, or values list.');
        }

        // 🔹 KEPT YOUR URL
        const url = `/api/forms/json/${formLinkName}/insertRecord`;

        // 🔹 WORKER LOGIC: Fetch Map ONCE
        const fieldMap = await getFieldMap(activeProfile, formLinkName);

        for (let i = 0; i < primaryFieldValues.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            if (activeJobs[jobId].status === 'paused') {
                consecutiveFailures = 0; 
            }
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const primaryValue = primaryFieldValues[i];
            if (!primaryValue.trim()) continue;

            const inputData = {
                ...defaultData,
                [primaryFieldLabelName]: primaryValue
            };
            
            Object.keys(inputData).forEach(key => {
                if (inputData[key] === null || inputData[key] === '') {
                    delete inputData[key];
                }
            });

            try {
                const params = new URLSearchParams();
                params.append('inputData', JSON.stringify(inputData));

                // 🔹 WORKER LOGIC: Pass fieldMap as last argument
                const response = await makeApiCall('post', url, params, activeProfile, 'people', {}, fieldMap);

                if (response.data?.response?.status === 0) {
                     socket.emit('peopleResult', { 
                        email: primaryValue, 
                        success: true,
                        details: `Record created. ID: ${response.data.response.result.pkId}`,
                        fullResponse: response.data,
                        profileName: selectedProfileName
                    });
                    
                    consecutiveFailures = 0; 

                } else {
                    const message = response.data?.response?.message || 'Failed to insert record.';
                    throw new Error(message);
                }

            } catch (error) {
                const { message, fullResponse } = parseError(error);
                const detailedError = fullResponse?.response?.errors?.error?.message || message;
                
                consecutiveFailures++; 

                socket.emit('peopleResult', { 
                    email: primaryValue, 
                    success: false, 
                    error: detailedError, 
                    fullResponse: fullResponse || error, 
                    profileName: selectedProfileName 
                });

                if (stopAfterFailures > 0 && consecutiveFailures >= stopAfterFailures) {
                    activeJobs[jobId].status = 'paused';
                    socket.emit('jobPaused', {
                        profileName: selectedProfileName,
                        reason: `Auto-paused after ${consecutiveFailures} consecutive failures.`,
                        jobType: 'people' 
                    });
                }
            }
        }

    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'people' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'people' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'people' });
            }
            delete activeJobs[jobId];
        }
    }
};

module.exports = {
    setActiveJobs,
    handleGetForms,
    handleGetFormComponents,
    handleInsertRecord,
    handleStartBulkInsertRecords, 
};