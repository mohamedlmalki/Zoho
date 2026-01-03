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

const handleCreateAndSendFsmInvoice = async (socket, data) => {
    const { invoiceData, delay, selectedProfileName, activeProfile } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'fsm-invoice');
    activeJobs[jobId] = { status: 'running' };

    try {
        if (!activeProfile || !activeProfile.fsm || !activeProfile.fsm.orgId) {
            throw new Error('FSM profile or orgId not configured.');
        }
        
        for (let i = 0; i < invoiceData.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const { work_order_id, email } = invoiceData[i];
            let invoiceId = null;

            try {
                // Step 1: Create Invoice
                const createData = {
                    "data": [
                        { "Work_Order": { "id": work_order_id } }
                    ]
                };
                
                const createResponse = await makeApiCall('post', '/Invoices', createData, activeProfile, 'fsm');
                
                let createDetails;
                if (createResponse.data && Array.isArray(createResponse.data.data)) {
                    createDetails = createResponse.data.data[0].details;
                } else {
                    throw new Error("Failed to create Invoice: " + (createResponse.data.message || "Unknown error"));
                }

                invoiceId = createDetails.id;
                
                socket.emit('fsmInvoiceResult', { 
                    workOrderId: work_order_id, 
                    email,
                    success: true, 
                    step: 'create',
                    details: `Invoice created: ${invoiceId}`,
                    fullResponse: createResponse.data,
                    profileName: selectedProfileName
                });

                // Step 2: Send Invoice
                const sendUrl = `/Invoices/${invoiceId}/actions/send`;
                const sendData = {
                    "data": { "to_mail_ids": [email] }
                };

                const sendResponse = await makeApiCall('post', sendUrl, sendData, activeProfile, 'fsm');

                socket.emit('fsmInvoiceResult', { 
                    workOrderId: work_order_id, 
                    email,
                    success: true, 
                    step: 'send',
                    details: `Invoice ${invoiceId} sent to ${email}.`,
                    fullResponse: sendResponse.data,
                    profileName: selectedProfileName
                });

            } catch (error) {
                const { message, fullResponse } = parseError(error);
                socket.emit('fsmInvoiceResult', { 
                    workOrderId: work_order_id,
                    email, 
                    success: false, 
                    step: invoiceId ? 'send' : 'create',
                    error: message, 
                    fullResponse, 
                    profileName: selectedProfileName 
                });
            }
        }

    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'fsm-invoice' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'fsm-invoice' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'fsm-invoice' });
            }
            delete activeJobs[jobId];
        }
    }
};


module.exports = {
    setActiveJobs,
    handleStartBulkCreateContact,
    handleCreateAndSendFsmInvoice,
};