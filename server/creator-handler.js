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

// This helper function builds the /data/ URL, matching the "Add Records" API doc
const getCreatorApiUrl = (activeProfile, path) => {
    const { ownerName, appName } = activeProfile.creator;
    // This path is relative to your baseUrl (e.g., https://.../creator/v2.1)
    return `/data/${ownerName}/${appName}${path}`;
};

const handleGetForms = async (socket, data) => {
    try {
        const { activeProfile } = data;
        if (!activeProfile || !activeProfile.creator) {
            throw new Error('Creator profile not configured.');
        }
        
        const { ownerName, appName } = activeProfile.creator;
        
        // This path matches the "Get Forms" API doc (PLURAL "forms")
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
        if (!activeProfile || !activeProfile.creator) {
            throw new Error('Creator profile not configured.');
        }
        if (!formLinkName) {
            throw new Error('Form Link Name is required.');
        }
        
        const { ownerName, appName } = activeProfile.creator;
        
        // --- THIS IS THE FIX ---
        // This path now matches the "Get Fields" API doc (SINGULAR "form")
        const url = `/meta/${ownerName}/${appName}/form/${formLinkName}/fields`;
        
        const response = await makeApiCall('get', url, null, activeProfile, 'creator');
        
        if (response.data && response.data.fields) {
            socket.emit('creatorFormComponentsResult', { success: true, fields: response.data.fields, formLinkName });
        } else {
            // This is the "error" that triggers the "No fields found" message in the UI
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
        if (!activeProfile || !activeProfile.creator) {
            throw new Error('Creator profile not configured.');
        }
        
        // This URL path is correct (e.g., /data/owner/app/form/My_Form)
        const url = getCreatorApiUrl(activeProfile, `/form/${formLinkName}`);
        
        // This payload wrapper is correct
        const postData = { data: { ...formData } }; 
            
        const response = await makeApiCall('post', url, postData, activeProfile, 'creator');
        
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
        stopAfterFailures = 0 // --- ADDED DEFAULT ---
    } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'creator');
    
    // Initialize job
    activeJobs[jobId] = { 
        status: 'running',
        consecutiveFailures: 0,
        stopAfterFailures: Number(stopAfterFailures) 
    };

    try {
        if (!activeProfile || !activeProfile.creator) {
            throw new Error('Creator profile not configured.');
        }
        if (!selectedFormLinkName || !bulkPrimaryField || !bulkPrimaryValues) {
            throw new Error('One or more form fields are missing. Cannot start bulk job.');
        }

        // This URL path is correct (e.g., /data/owner/app/form/My_Form)
        const url = getCreatorApiUrl(activeProfile, `/form/${selectedFormLinkName}`);
        
        for (let i = 0; i < bulkPrimaryValues.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            // Wait while paused
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // --- AUTO-PAUSE CHECK (Before Start) ---
            if (activeJobs[jobId].stopAfterFailures > 0 && 
                activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                 
                 if (activeJobs[jobId].status !== 'paused') {
                     activeJobs[jobId].status = 'paused';
                     socket.emit('jobPaused', { 
                        profileName: selectedProfileName, 
                        reason: `Paused automatically after ${activeJobs[jobId].consecutiveFailures} consecutive failures.` 
                     });
                 }
                 while (activeJobs[jobId]?.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 500));
                 }
            }
            // ----------------------------------------

            if (i > 0 && bulkDelay > 0) await interruptibleSleep(bulkDelay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const primaryValue = bulkPrimaryValues[i];
            if (!primaryValue.trim()) continue;
            
            // This payload wrapper is correct
            const recordData = { 
                ...bulkDefaultData,
                [bulkPrimaryField]: primaryValue
            };
            
            const postData = { 
                data: recordData
            };
            // --- End wrapper ---

            try {
                const response = await makeApiCall('post', url, postData, activeProfile, 'creator');
                
                let details = "Record added successfully.";
                if (response.data.result && Array.isArray(response.data.result) && response.data.result[0]) {
                    const resultData = response.data.result[0];
                    if (resultData.code === 3000) {
                         details = `Record Added. ID: ${resultData.data.ID}`;
                    } else {
                        throw new Error(resultData.message || "An unknown error occurred.");
                    }
                } else if (response.data.code && response.data.code !== 3000) {
                     throw new Error(response.data.message || "An unknown error occurred.");
                }

                // Success! Reset failure counter
                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;

                socket.emit('creatorResult', { 
                    primaryValue, 
                    success: true, 
                    details: details,
                    fullResponse: response.data,
                    profileName: selectedProfileName
                });

            } catch (error) {
                // Failure! Increment counter
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
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'creator' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'creator' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'creator' });
            }
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