// --- FILE: server/meeting-handler.js (MODIFIED) ---

const { 
    makeApiCall, 
    parseError, 
    createJobId, 
    getValidAccessToken 
} = require('./utils');

// This local variable will be populated by index.js
let activeJobs = {};

/**
 * Sets the active jobs reference.
 * @param {object} jobs - The active jobs object from index.js
 */
const setActiveJobs = (jobs) => {
    activeJobs = jobs;
};

/**
 * Fetches the list of all upcoming webinars for the user.
 * This is called by the frontend to populate the dropdown.
 */
const handleGetWebinars = async (socket, data) => {
    const { activeProfile } = data;
    console.log(`[INFO] Fetching webinars for profile: ${activeProfile.profileName}`);
    
    try {
        // 1. Get a valid access token for the 'meeting' service
        await getValidAccessToken(activeProfile, 'meeting');
        
        // 2. Get zsoid from profile
        const zsoid = activeProfile.meeting?.zsoid;
        if (!zsoid) {
            throw new Error("Zoho Meeting 'zsoid' is not configured in the profile.");
        }

        // 3. Make the API call to fetch webinars ("List of Webinar API")
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

        // 4. Send the list of webinars back to the client
        socket.emit('webinarsList', { 
            success: true, 
            data: response.data.session.map(w => ({
                id: w.meetingKey, // Use meetingKey as the unique ID
                title: w.topic,
                startTime: w.startTime,
                meetingKey: w.meetingKey,
                instanceId: w.sysId, // Use sysId as the instanceId (Event Id)
                zsoid: zsoid // Pass back the zsoid
            }))
        });

    } catch (error) {
        const { message } = parseError(error);
        console.error(`[ERROR] Fetching webinars: ${message}`);
        // Send an error back to the client
        socket.emit('webinarError', { 
            success: false, 
            message: `Failed to fetch webinars: ${message}` 
        });
    }
};

/**
 * Handles the bulk registration job.
 * --- THIS FUNCTION IS NOW MODIFIED FOR ONE-BY-ONE PROCESSING ---
 */
const handleStartBulkRegistration = async (socket, data) => {
    const { 
        selectedProfileName, 
        activeProfile,
        webinar, // The full selected webinar object from the frontend
        emails, // The raw string of emails
        firstName, // The single first name
        delay, // The delay in seconds from the frontend
        displayName // The display name for the export file
    } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'webinar');
    activeJobs[jobId] = { status: 'running' };

    console.log(`[INFO] Starting ONE-BY-ONE webinar registration for job: ${jobId} with delay: ${delay}s`);

    try {
        // 1. Parse the raw emails string into an array
        const allEmails = emails
            .split('\n')
            .map(line => line.trim())
            .filter(line => line); // Skip empty lines
        
        if (allEmails.length === 0) {
            throw new Error("No registrants provided.");
        }

        // 2. Get API keys from the selected webinar and profile
        const meetingKey = webinar.meetingKey;
        const zsoid = activeProfile.meeting?.zsoid;
        const instanceId = webinar.instanceId;
        
        if (!meetingKey || !zsoid || !instanceId) {
            throw new Error("Missing 'meetingKey', 'zsoid', or 'instanceId'. Cannot proceed.");
        }

        // 3. Start the loop to process one by one
        for (const email of allEmails) {
            // Check if job was paused or ended
            if (activeJobs[jobId]?.status === 'paused') {
                console.log(`[INFO] Job ${jobId} paused.`);
                // Wait until resumed
                while (activeJobs[jobId]?.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log(`[INFO] Job ${jobId} resumed.`);
            }
            if (activeJobs[jobId]?.status === 'ended') {
                console.log(`[INFO] Job ${jobId} ended by user.`);
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
                // 4. Get a fresh token FOR EACH request in the loop
                await getValidAccessToken(activeProfile, 'meeting');

                // 5. Create the payload for a SINGLE registrant
                const registrantsArray = [{ 
                    email: email, 
                    firstName: firstName,
                    lastName: "." // Use placeholder as requested
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
                
                // 6. Parse the response for this single user
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
                // Handle API call errors for this specific email
                const { message, fullResponse } = parseError(error);
                console.error(`[ERROR] Failed to register ${email}: ${message}`);
                resultPayload.error = message;
                resultPayload.fullResponse = fullResponse;
            }

            // 7. Emit the result for this single email
            socket.emit('webinarResult', resultPayload);

            // 8. Wait for the delay
            await new Promise(resolve => setTimeout(resolve, (delay || 1) * 1000));
        }

    } catch (error) {
        // This catches errors in the initial setup (e.g., parsing)
        const { message } = parseError(error);
        console.error(`[ERROR] Bulk registration job ${jobId} failed: ${message}`);
        socket.emit('bulkError', { 
            profileName: selectedProfileName, 
            jobType: 'webinar',
            message 
        });
    } finally {
        // --- THIS IS THE FIX ---
        // 9. Signal that the job is complete OR ended
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            
            if (finalStatus === 'ended') {
                // If the job was ended by the user, emit 'bulkEnded'
                socket.emit('bulkEnded', { 
                    profileName: selectedProfileName, 
                    jobType: 'webinar' 
                });
            } else if (finalStatus === 'running' || finalStatus === 'paused') {
                // If the job finished normally (wasn't ended), emit 'bulkComplete'
                socket.emit('bulkComplete', { 
                    profileName: selectedProfileName, 
                    jobType: 'webinar' 
                });
            }
            
            delete activeJobs[jobId];
        }
        // --- END FIX ---
    }
};

module.exports = {
    setActiveJobs,
    handleGetWebinars,
    handleStartBulkRegistration
};