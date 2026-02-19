// --- FILE: apps/ops/server/meeting-handler.js ---

const { 
    makeApiCall, 
    parseError, 
    createJobId, 
    getValidAccessToken 
} = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobs) => {
    activeJobs = jobs;
};

const handleGetWebinars = async (socket, data) => {
    const { activeProfile } = data;
    console.log(`[INFO] Fetching webinars for profile: ${activeProfile.profileName}`);
    
    try {
        await getValidAccessToken(activeProfile, 'meeting');
        
        const zsoid = activeProfile.meeting?.zsoid;
        if (!zsoid) {
            throw new Error("Zoho Meeting 'zsoid' is not configured in the profile.");
        }

        const queryParams = {
            listtype: 'upcoming',
            index: 1,
            count: 100
        };
        
        const response = await makeApiCall(
            'get', 
            `/api/v2/${zsoid}/webinar.json`,
            null, 
            activeProfile, 
            'meeting',
            queryParams
        );

        socket.emit('webinarsList', { 
            success: true, 
            data: response.data.session.map(w => ({
                id: w.meetingKey, 
                title: w.topic,
                startTime: w.startTime,
                meetingKey: w.meetingKey,
                instanceId: w.sysId, 
                zsoid: zsoid 
            }))
        });

    } catch (error) {
        const { message } = parseError(error);
        console.error(`[ERROR] Fetching webinars: ${message}`);
        socket.emit('webinarError', { 
            success: false, 
            message: `Failed to fetch webinars: ${message}` 
        });
    }
};

const handleStartBulkRegistration = async (socket, data) => {
    const { 
        selectedProfileName, 
        activeProfile,
        webinar, 
        emails, 
        firstName, 
        delay, 
        displayName 
    } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'webinar');
    activeJobs[jobId] = { status: 'running' };

    console.log(`[INFO] Starting ONE-BY-ONE webinar registration for job: ${jobId} with delay: ${delay}s`);

    try {
        const allEmails = emails
            .split('\n')
            .map(line => line.trim())
            .filter(line => line); 
        
        if (allEmails.length === 0) {
            throw new Error("No registrants provided.");
        }

        const meetingKey = webinar.meetingKey;
        const zsoid = activeProfile.meeting?.zsoid;
        const instanceId = webinar.instanceId;
        
        if (!meetingKey || !zsoid || !instanceId) {
            throw new Error("Missing 'meetingKey', 'zsoid', or 'instanceId'. Cannot proceed.");
        }

        for (const email of allEmails) {
            if (activeJobs[jobId]?.status === 'paused') {
                while (activeJobs[jobId]?.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            if (activeJobs[jobId]?.status === 'ended') {
                break;
            }

            let resultPayload = {
                profileName: selectedProfileName,
                email: email,
                success: false,
                details: '',
                error: '',
                fullResponse: null,
                displayName: displayName || 'webinar_registration_export',
                subject: webinar.title
            };

            try {
                // Ensure fresh token
                await getValidAccessToken(activeProfile, 'meeting');

                const registrantsArray = [{ 
                    email: email, 
                    firstName: firstName,
                    lastName: "." 
                }];
                
                const apiEndpoint = `/api/v2/${zsoid}/register/${meetingKey}.json`;
                const queryParams = { sendMail: 'true', instanceId: instanceId };
                const payload = { registrant: registrantsArray }; 
        
                const response = await makeApiCall(
                    'post', 
                    apiEndpoint, 
                    payload, 
                    activeProfile, 
                    'meeting',
                    queryParams
                );
                
                const result = response.data.registrant[0];
                const success = !!result.joinLink;

                if (success) {
                    resultPayload.success = true;
                    resultPayload.details = `Registered - Join Link acquired`;
                    resultPayload.fullResponse = result;
                } else {
                    resultPayload.error = "Registration failed (see full response)";
                    resultPayload.fullResponse = result;
                }

            } catch (error) {
                const { message, fullResponse } = parseError(error);
                console.error(`[ERROR] Failed to register ${email}: ${message}`);
                resultPayload.error = message;
                resultPayload.fullResponse = fullResponse;
            }

            socket.emit('webinarResult', resultPayload);

            await new Promise(resolve => setTimeout(resolve, (delay || 1) * 1000));
        }

    } catch (error) {
        const { message } = parseError(error);
        socket.emit('bulkError', { 
            profileName: selectedProfileName, 
            jobType: 'webinar',
            message 
        });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { 
                    profileName: selectedProfileName, 
                    jobType: 'webinar' 
                });
            } else if (finalStatus === 'running' || finalStatus === 'paused') {
                socket.emit('bulkComplete', { 
                    profileName: selectedProfileName, 
                    jobType: 'webinar' 
                });
            }
            
            delete activeJobs[jobId];
        }
    }
};

module.exports = {
    setActiveJobs,
    handleGetWebinars,
    handleStartBulkRegistration
};