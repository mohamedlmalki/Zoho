const { makeApiCall, parseError, createJobId } = require('./utils');
const FormData = require('form-data');

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
    const { emails, lastName, delay, selectedProfileName, activeProfile } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'fsm-contact');
    activeJobs[jobId] = { status: 'running' };
    
    try {
        if (!activeProfile || !activeProfile.fsm || !activeProfile.fsm.orgId) {
            throw new Error('FSM profile or orgId not configured.');
        }
        
        const orgId = activeProfile.fsm.orgId;
        const url = '/Contacts/bulk';
        const headers = { 'X-FSM-ORG-ID': orgId };

        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            const email = emails[i];
            if (!email.trim()) continue;

            const postData = new FormData();
            postData.append('data', JSON.stringify([
                { "Last_Name": lastName, "Email": email }
            ]));

            try {
                // --- MODIFICATION: Pass headers as 6th argument ---
                const response = await makeApiCall('post', url, postData, activeProfile, 'fsm', headers);
                
                const responseData = response.data.data[0];
                if (responseData.status === 'success') {
                    socket.emit('fsmContactResult', { 
                        email, 
                        success: true, 
                        details: `Contact created. ID: ${responseData.details.id}`,
                        fullResponse: responseData,
                        profileName: selectedProfileName
                    });
                } else {
                    throw new Error(responseData.message);
                }
            } catch (error) {
                const { message, fullResponse } = parseError(error);
                socket.emit('fsmContactResult', { 
                    email, 
                    success: false, 
                    error: message, 
                    fullResponse, 
                    profileName: selectedProfileName 
                });
            }
        }

    } catch (error) {
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
        
        const orgId = activeProfile.fsm.orgId;
        const headers = { 'X-FSM-ORG-ID': orgId };

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
                
                // --- MODIFICATION: Pass headers as 6th argument ---
                const createResponse = await makeApiCall('post', '/Invoices', createData, activeProfile, 'fsm', headers);
                
                const createDetails = createResponse.data.data[0].details;
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

                // --- MODIFICATION: Pass headers as 6th argument ---
                const sendResponse = await makeApiCall('post', sendUrl, sendData, activeProfile, 'fsm', headers);

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