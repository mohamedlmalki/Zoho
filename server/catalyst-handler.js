const { makeApiCall, parseError, createJobId } = require('./utils');
const FormData = require('form-data'); // Make sure FormData is required

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

const handleStartBulkEmail = async (socket, data) => {
    console.log('[EMAIL_HANDLER] Received startBulkEmail request.');
    const { emails, subject, content, delay, selectedProfileName, activeProfile, displayName } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'email');
    activeJobs[jobId] = { status: 'running' };

    try {
        if (!activeProfile || !activeProfile.catalyst || !activeProfile.catalyst.projectId) {
            throw new Error('Catalyst profile or Project ID is not configured.');
        }
        
        const fromEmail = activeProfile.catalyst.fromEmail;
        if (!fromEmail) {
            throw new Error("From Email is not configured in the profile for Catalyst.");
        }
        console.log(`[EMAIL_HANDLER] Starting job for ${emails.length} emails from sender: ${fromEmail}`);

        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const email = emails[i];
            if (!email.trim()) continue;

            console.log(`[EMAIL_HANDLER] Processing email #${i + 1}: ${email}`);

            try {
                const projectId = activeProfile.catalyst.projectId;
                
                const formData = new FormData();
                formData.append('from_email', fromEmail);
                formData.append('to_email', email);
                formData.append('subject', subject);
                formData.append('content', content);
                formData.append('html_mode', 'true');
                if (displayName) {
                    formData.append('display_name', displayName);
                }
                
                console.log(`[EMAIL_HANDLER] Sending API call for ${email}`);
                const response = await makeApiCall('post', `/baas/v1/project/${projectId}/email/send`, formData, activeProfile, 'catalyst');
                
                socket.emit('emailResult', { 
                    email, 
                    success: true,
                    details: 'Email sent successfully.',
                    fullResponse: response.data,
                    profileName: selectedProfileName
                });
                console.log(`[EMAIL_HANDLER] Successfully sent email to ${email}`);

            } catch (error) {
                console.error(`[EMAIL_HANDLER] Failed to send email to ${email}`);
                const { message, fullResponse } = parseError(error);
                socket.emit('emailResult', { email, success: false, error: message, fullResponse, profileName: selectedProfileName });
            }
        }

    } catch (error) {
        console.error('[EMAIL_HANDLER] A critical error occurred in the bulk email job:', error.message);
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'email' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'email' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'email' });
            }
            delete activeJobs[jobId];
        }
        console.log('[EMAIL_HANDLER] Bulk email job finished.');
    }
};

const handleStartBulkSignup = async (socket, data) => {
    const { emails, firstName, lastName, delay, selectedProfileName, activeProfile } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'catalyst');
    activeJobs[jobId] = { status: 'running' };

    try {
        if (!activeProfile || !activeProfile.catalyst || !activeProfile.catalyst.projectId) {
            throw new Error('Catalyst profile or Project ID is not configured.');
        }

        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const email = emails[i];
            if (!email.trim()) continue;

            const signupData = {
                platform_type: 'web',
                user_details: {
                    first_name: firstName,
                    last_name: lastName,
                    email_id: email,
                }
            };

            try {
                const projectId = activeProfile.catalyst.projectId;
                const response = await makeApiCall('post', `/baas/v1/project/${projectId}/project-user/signup`, signupData, activeProfile, 'catalyst');
                
                socket.emit('catalystResult', { 
                    email, 
                    success: true,
                    details: `User ${response.data.data.user_details.first_name} ${response.data.data.user_details.last_name} created successfully.`,
                    fullResponse: response.data,
                    profileName: selectedProfileName
                });

            } catch (error) {
                const { message, fullResponse } = parseError(error);
                socket.emit('catalystResult', { email, success: false, error: message, fullResponse, profileName: selectedProfileName });
            }
        }

    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'catalyst' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'catalyst' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'catalyst' });
            }
            delete activeJobs[jobId];
        }
    }
};

const handleGetUsers = async (socket, data) => {
    console.log('[CATALYST_HANDLER] Received getUsers request with data:', data);
    try {
        const { activeProfile, page, per_page } = data;
        if (!activeProfile || !activeProfile.catalyst || !activeProfile.catalyst.projectId) {
            throw new Error('Catalyst profile or Project ID is not configured.');
        }

        const projectId = activeProfile.catalyst.projectId;
        const start = (page - 1) * per_page + 1;
        
        console.log(`[CATALYST_HANDLER] Fetching users for project ${projectId}, start: ${start}, end: ${per_page}`);

        const response = await makeApiCall('get', `/baas/v1/project/${projectId}/project-user?start=${start}&end=${per_page}`, null, activeProfile, 'catalyst');
        
        const jsonString = response.data;
        const safeJsonString = jsonString.replace(/"(user_id|zuid|zaaid)":\s*(\d{16,})/g, '"$1": "$2"');
        
        const parsedData = JSON.parse(safeJsonString);

        console.log('[CATALYST_HANDLER] Successfully fetched users. Count:', parsedData.data.length);
        socket.emit('usersResult', { success: true, users: parsedData.data });
    } catch (error) {
        console.error('[CATALYST_HANDLER] Error in handleGetUsers:', error);
        const { message, fullResponse } = parseError(error);
        socket.emit('usersResult', { success: false, error: message, fullResponse });
    }
};

const handleDeleteUser = async (socket, data) => {
    console.log('[CATALYST_HANDLER] Received deleteUser request with data:', data);
    try {
        const { activeProfile, userId } = data;
        if (!activeProfile || !activeProfile.catalyst || !activeProfile.catalyst.projectId) {
            throw new Error('Catalyst profile or Project ID is not configured.');
        }

        if (!userId) {
            throw new Error('User ID is missing in the delete request.');
        }

        const projectId = activeProfile.catalyst.projectId;
        console.log(`[CATALYST_HANDLER] Deleting user with ID: ${userId} from project ${projectId}`);

        const response = await makeApiCall('delete', `/baas/v1/project/${projectId}/project-user/${userId}`, null, activeProfile, 'catalyst');
        
        console.log('[CATALYST_HANDLER] Successfully deleted user. Response:', response.data);
        socket.emit('userDeletedResult', { success: true, ...response.data });
    } catch (error) {
        console.error('[CATALYST_HANDLER] Error in handleDeleteUser:', error);
        const { message, fullResponse } = parseError(error);
        socket.emit('userDeletedResult', { success: false, error: message, fullResponse });
    }
};

const handleDeleteUsers = async (socket, data) => {
    console.log('[CATALYST_HANDLER] Received deleteUsers request with data:', data);
    try {
        const { activeProfile, userIds } = data;
        if (!activeProfile || !activeProfile.catalyst || !activeProfile.catalyst.projectId) {
            throw new Error('Catalyst profile or Project ID is not configured.');
        }
        if (!userIds || userIds.length === 0) {
            throw new Error('No users selected for deletion.');
        }
        
        let deletedCount = 0;
        for (const userId of userIds) {
            await makeApiCall('delete', `/baas/v1/project/${activeProfile.catalyst.projectId}/project-user/${userId}`, null, activeProfile, 'catalyst');
            deletedCount++;
            socket.emit('userDeleteProgress', { deletedCount, total: userIds.length });
        }
        
        socket.emit('usersDeletedResult', { success: true, deletedCount: userIds.length });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('usersDeletedResult', { success: false, error: message });
    }
};


module.exports = {
    setActiveJobs,
    handleStartBulkSignup,
    handleGetUsers,
    handleDeleteUser,
    handleDeleteUsers,
    handleStartBulkEmail,
};