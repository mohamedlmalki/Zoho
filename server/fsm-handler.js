// --- FILE: server/fsm-handler.js ---

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


const handleStartBulkCreateContact = async (socket, data) => {
    const { emails, lastName, delay, selectedProfileName, activeProfile, stopAfterFailures } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'fsm-contact');
    activeJobs[jobId] = { status: 'running' };
    
    let failureCount = 0; 

    try {
        if (!activeProfile || !activeProfile.fsm || !activeProfile.fsm.orgId) {
            throw new Error('FSM profile or orgId not configured.');
        }
        
        const url = '/Contacts'; 

        for (let i = 0; i < emails.length; i++) {
            // --- FIX: END JOB INSTEAD OF PAUSE ---
            if (stopAfterFailures > 0 && failureCount >= stopAfterFailures) {
                // Throwing an error here triggers the 'catch' block below, 
                // which emits 'bulkError', effectively ENDING the job on the frontend.
                throw new Error(`Job stopped automatically: Reached limit of ${stopAfterFailures} failures.`);
            }
            // --------------------------------------

            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            const email = emails[i];
            if (!email.trim()) continue;

            const postData = {
                "data": [
                    { 
                        "Last_Name": lastName, 
                        "Email": email 
                    }
                ]
            };

            try {
                const response = await makeApiCall('post', url, postData, activeProfile, 'fsm');
                
                let responseData;
                if (response.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
                    responseData = response.data.data[0];
                } else if (response.data && (response.data.code || response.data.status)) {
                    responseData = response.data;
                } else {
                    responseData = { status: 'error', message: 'Unknown response format', fullResponse: response.data };
                }

                if (responseData.status === 'success' || responseData.code === 'SUCCESS') {
                    // Optional: Reset failure count on success if you want consecutive failures only
                    // failureCount = 0; 
                    socket.emit('fsmContactResult', { 
                        email, 
                        success: true, 
                        details: `Contact created. ID: ${responseData.details?.id || 'N/A'}`,
                        fullResponse: responseData,
                        profileName: selectedProfileName
                    });
                } else {
                    throw new Error(responseData.message || responseData.code || 'Unknown Error');
                }

            } catch (error) {
                failureCount++; 
                const { message, fullResponse } = parseError(error);
                socket.emit('fsmContactResult', { 
                    email, 
                    success: false, 
                    error: message, 
                    fullResponse: fullResponse || error.response?.data, 
                    profileName: selectedProfileName 
                });
            }
        }

    } catch (error) {
        // This 'bulkError' event tells the frontend to set isProcessing = false
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'fsm-contact' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'fsm-contact' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'fsm-contact' });
            }
            delete activeJobs[jobId];
        }
    }
};




module.exports = {
    setActiveJobs,
    handleStartBulkCreateContact,
};