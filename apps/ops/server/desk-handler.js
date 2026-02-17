// --- FILE: server/desk-handler.js ---

const { makeApiCall, parseError, writeToTicketLog, createJobId, readTicketLog, readProfiles } = require('./utils');

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

const handleSendSingleTicket = async (data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply } = data;
    if (!email || !selectedProfileName) return { success: false, error: 'Missing email or profile.' };
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    try {
        if (!activeProfile) return { success: false, error: 'Profile not found.' };
        const deskConfig = activeProfile.desk;
        const ticketData = { subject, description, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };

        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };
        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: description, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) { fullResponseData.sendReply = parseError(replyError); }
        }
        return { success: true, fullResponse: fullResponseData, message: `Ticket #${newTicket.ticketNumber} created.` };
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};

const handleVerifyTicketEmail = async (data) => {
    const { ticket, profileName } = data;
    if (!ticket || !profileName) return { success: false, details: 'Missing ticket/profile.' };
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === profileName);
    if (!activeProfile) return { success: false, details: 'Profile not found.' };
    return await verifyTicketEmail(null, { ticket, profile: activeProfile });
};

const handleSendTestTicket = async (socket, data) => {
    console.log(`[Desk] Sending Test Ticket to ${data.email}...`);
    const { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, activeProfile } = data;
     if (!email || !selectedProfileName) return socket.emit('testTicketResult', { success: false, error: 'Missing email or profile.' });
    try {
        if (!activeProfile) return socket.emit('testTicketResult', { success: false, error: 'Profile not found.' });
        const deskConfig = activeProfile.desk;
        const ticketData = { subject, description, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };

        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };
        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: description, contentType: 'html', channel: 'EMAIL' };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) { fullResponseData.sendReply = parseError(replyError); }
        }

        socket.emit('testTicketResult', { success: true, fullResponse: fullResponseData });
        console.log(`[Desk] Test Ticket #${newTicket.ticketNumber} created.`);

        if (verifyEmail) {
            verifyTicketEmail(socket, {ticket: newTicket, profile: activeProfile, resultEventName: 'testTicketVerificationResult', email});
        }
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        console.error(`[Desk] Test Ticket Error: ${message}`);
        socket.emit('testTicketResult', { success: false, error: message, fullResponse });
    }
};

const handleStartBulkCreate = async (socket, data) => {
    const { emails, subject, description, delay, selectedProfileName, sendDirectReply, verifyEmail, activeProfile, stopAfterFailures = 0 } = data;
    
    console.log(`[Desk] Starting Bulk Job for ${selectedProfileName}. Total: ${emails.length} emails.`);
    const jobId = createJobId(socket.id, selectedProfileName, 'ticket');
    
    activeJobs[jobId] = { status: 'running', consecutiveFailures: 0, stopAfterFailures: Number(stopAfterFailures) };
    
    try {
        if (!activeProfile) throw new Error('Profile not found.');
        const deskConfig = activeProfile.desk;
        if (sendDirectReply && !deskConfig.fromEmailAddress) throw new Error(`Profile "${selectedProfileName}" missing "fromEmailAddress".`);
        
        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') await new Promise(resolve => setTimeout(resolve, 500));

            // Auto-pause check
            if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                 if (activeJobs[jobId].status !== 'paused') {
                     activeJobs[jobId].status = 'paused';
                     socket.emit('jobPaused', { profileName: selectedProfileName, reason: `Paused: ${activeJobs[jobId].consecutiveFailures} failures.` });
                     console.log(`[Desk] Job Paused due to failures.`);
                 }
                 while (activeJobs[jobId]?.status === 'paused') await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const email = emails[i];
            if (!email.trim()) continue;

            console.log(`[Desk] Processing (${i+1}/${emails.length}): ${email}`);

            const ticketData = { subject, description, departmentId: deskConfig.defaultDepartmentId, contact: { email }, channel: 'Email' };
            
            try {
                const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
                const newTicket = ticketResponse.data;
                let successMessage = `Ticket #${newTicket.ticketNumber} created.`;
                let fullResponseData = { ticketCreate: newTicket };
                
                writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

                if (sendDirectReply) {
                    try {
                        const replyData = { fromEmailAddress: deskConfig.fromEmailAddress, to: email, content: description, contentType: 'html', channel: 'EMAIL' };
                        const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                        successMessage += ` Reply sent.`;
                        fullResponseData.sendReply = replyResponse.data;
                    } catch (replyError) {
                        const { message } = parseError(replyError);
                        successMessage += ` Reply Failed: ${message}`;
                        fullResponseData.sendReply = { error: parseError(replyError) };
                    }
                }

                socket.emit('ticketResult', { 
                    email, 
                    success: true, 
                    ticketNumber: newTicket.ticketNumber, 
                    details: successMessage,
                    fullResponse: fullResponseData,
                    profileName: selectedProfileName
                });

                if (verifyEmail) {
                    console.log(`[Desk] Queuing verification for #${newTicket.ticketNumber}...`);
                    verifyTicketEmail(socket, { ticket: newTicket, profile: activeProfile, jobId, email });
                }

            } catch (error) {
                activeJobs[jobId].consecutiveFailures++;
                const { message, fullResponse } = parseError(error);
                console.error(`[Desk] Error for ${email}: ${message}`);
                socket.emit('ticketResult', { email, success: false, error: message, fullResponse, profileName: selectedProfileName });
            }
        }

    } catch (error) {
        console.error(`[Desk] Bulk Job Error: ${error.message}`);
        socket.emit('bulkError', { message: error.message || 'Error', profileName: selectedProfileName, jobType: 'ticket' });
    } finally {
        if (activeJobs[jobId]) {
            console.log(`[Desk] Job Finished for ${selectedProfileName}`);
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'ticket' });
            else socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'ticket' });
            delete activeJobs[jobId];
        }
    }
};

const verifyTicketEmail = async (socket, { ticket, profile, resultEventName = 'ticketUpdate', jobId, email }) => {
    let fullResponse = { ticketCreate: ticket, verifyEmail: {} };
    console.log(`[Desk] Verifying ticket #${ticket.ticketNumber} for ${email}...`);
    
    try {
        // Delay increased to 25s for reliability
        if (socket) await new Promise(resolve => setTimeout(resolve, 25000)); 
        
        if (jobId && activeJobs[jobId] && activeJobs[jobId].status === 'ended') return;
        
        const [workflowHistoryResponse, notificationHistoryResponse] = await Promise.all([
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=WorkflowHistory`, null, profile, 'desk'),
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=NotificationRuleHistory`, null, profile, 'desk')
        ]);

        const allHistoryEvents = [ ...(workflowHistoryResponse.data.data || []), ...(notificationHistoryResponse.data.data || []) ];
        fullResponse.verifyEmail.history = { workflowHistory: workflowHistoryResponse.data, notificationHistory: notificationHistoryResponse.data };

        if (allHistoryEvents.length > 0) {
            if (jobId && activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;
            console.log(`[Desk] Verification SUCCESS for #${ticket.ticketNumber}`);
            
            if (socket) {
                socket.emit(resultEventName, { 
                    ticketNumber: ticket.ticketNumber, 
                    success: true, 
                    details: 'Verified: Automation email sent successfully.', 
                    fullResponse, 
                    profileName: profile.profileName,
                    email: email 
                });
            }
            return { success: true };
        } else {
            // FAILED
            const failureResponse = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${profile.desk.defaultDepartmentId}`, null, profile, 'desk');
            const failure = failureResponse.data.data?.find(f => String(f.ticketNumber) === String(ticket.ticketNumber));
            fullResponse.verifyEmail.failure = failure || "No specific failure found.";
            
            console.log(`[Desk] Verification FAILED for #${ticket.ticketNumber}. Reason: ${failure ? failure.reason : 'No history found'}`);

            if (jobId && activeJobs[jobId]) {
                activeJobs[jobId].consecutiveFailures++;
                if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                    if (activeJobs[jobId].status !== 'paused') {
                        activeJobs[jobId].status = 'paused';
                        socket.emit('jobPaused', { profileName: profile.profileName, reason: `Paused: Verification failed for #${ticket.ticketNumber}.` });
                    }
                }
            }

            if (socket) {
                socket.emit(resultEventName, { 
                    ticketNumber: ticket.ticketNumber, 
                    success: false, 
                    details: failure ? `Verification Failed: ${failure.reason}` : 'Verification Failed: No automation history found (Timeout 25s).',
                    fullResponse,
                    profileName: profile.profileName,
                    email: email 
                });
            }
            return { success: false };
        }

    } catch (error) {
        const { message, fullResponse: errorResponse } = parseError(error);
        fullResponse.verifyEmail.error = errorResponse;
        console.error(`[Desk] Verification ERROR for #${ticket.ticketNumber}: ${message}`);
        
        if (jobId && activeJobs[jobId]) {
            activeJobs[jobId].consecutiveFailures++;
             if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                if (activeJobs[jobId].status !== 'paused') {
                    activeJobs[jobId].status = 'paused';
                    socket.emit('jobPaused', { profileName: profile.profileName, reason: `Paused: Verification Error.` });
                }
            }
        }

        if (socket) {
             socket.emit(resultEventName, { 
                ticketNumber: ticket.ticketNumber, 
                success: false, 
                details: `Verification Error: ${message}`,
                fullResponse,
                profileName: profile.profileName,
                email: email
            });
        }
        return { success: false };
    }
};

// --- RESTORED FUNCTIONS ---

const handleGetEmailFailures = async (socket, data) => {
    try {
        const { selectedProfileName } = data;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

        if (!activeProfile || !activeProfile.desk) {
            throw new Error('Desk profile not found for fetching email failures.');
        }

        const departmentId = activeProfile.desk.defaultDepartmentId;
        const response = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${departmentId}&limit=50`, null, activeProfile, 'desk');
        
        const failures = response.data.data || [];
        const ticketLog = readTicketLog();
        const failuresWithEmails = failures.map(failure => {
            const logEntry = ticketLog.find(entry => String(entry.ticketNumber) === String(failure.ticketNumber));
            return {
                ...failure,
                email: logEntry ? logEntry.email : 'Unknown',
            };
        });

        socket.emit('emailFailuresResult', { success: true, data: failuresWithEmails });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('emailFailuresResult', { success: false, error: message });
    }
};

const handleClearEmailFailures = async (socket, data) => {
    try {
        const { selectedProfileName } = data;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

        if (!activeProfile || !activeProfile.desk) {
            throw new Error('Desk profile not found for clearing email failures.');
        }

        const departmentId = activeProfile.desk.defaultDepartmentId;
        await makeApiCall('patch', `/api/v1/emailFailureAlerts?department=${departmentId}`, null, activeProfile, 'desk');
        
        socket.emit('clearEmailFailuresResult', { success: true });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('clearEmailFailuresResult', { success: false, error: message });
    }
};

const handleGetMailReplyAddressDetails = async (socket, data) => {
    try {
        const { selectedProfileName } = data;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

        if (!activeProfile || !activeProfile.desk) {
            return socket.emit('mailReplyAddressDetailsResult', { success: false, error: 'Desk profile not found' });
        }
        
        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        if (!mailReplyAddressId) {
            return socket.emit('mailReplyAddressDetailsResult', { success: true, notConfigured: true });
        }

        const response = await makeApiCall('get', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, null, activeProfile, 'desk');
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });

    } catch (error) {
        const { message } = parseError(error);
        socket.emit('mailReplyAddressDetailsResult', { success: false, error: message });
    }
};

const handleUpdateMailReplyAddressDetails = async (socket, data) => {
    try {
        const { displayName, selectedProfileName } = data;
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

        if (!activeProfile || !activeProfile.desk || !activeProfile.desk.mailReplyAddressId) {
            throw new Error('Mail Reply Address ID is not configured for this profile.');
        }

        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        const updateData = { displayName };
        const response = await makeApiCall('patch', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, updateData, activeProfile, 'desk');
        
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('mailReplyAddressDetailsResult', { success: false, error: message });
    }
};

module.exports = {
    setActiveJobs,
    handleSendTestTicket,
    handleStartBulkCreate,
    handleGetEmailFailures,
    handleClearEmailFailures,
    handleGetMailReplyAddressDetails,
    handleUpdateMailReplyAddressDetails,
    handleSendSingleTicket,
    handleVerifyTicketEmail
};