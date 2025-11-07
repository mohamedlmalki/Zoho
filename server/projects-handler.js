// --- FILE: server/projects-handler.js (FULL CODE - FINAL FIX) ---

const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const { delay } = require('./utils'); // Assuming delay is in utils, based on your original file
const axios = require('axios'); 

let activeJobs = {};

const setActiveJobs = (jobs) => {
    activeJobs = jobs;
};

// --- Utility function for job control (from your file, UNCHANGED) ---
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

/**
 * Fetches Zoho Projects portals using temporary credentials.
 */
const handleGetPortals = async (socket, data) => {
    console.log('[SERVER LOG] handleGetPortals triggered.'); 
    const { clientId, clientSecret, refreshToken } = data;

    const tempProfile = {
        profileName: 'temp_portal_fetch',
        clientId,
        clientSecret,
        refreshToken,
        projects: { portalId: '' }
    };

    try {
        await getValidAccessToken(tempProfile, 'projects');
        // YOUR WORKING PATH (UNCHANGED)
        const response = await makeApiCall('get', '/portals', null, tempProfile, 'projects');

        if (Array.isArray(response.data) && response.data.length > 0) {
            socket.emit('projectsPortalsResult', { portals: response.data });
        } else {
            socket.emit('projectsPortalsResult', { portals: [] });
        }
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsPortalsError', { message: message || 'Failed to fetch portals.' });
    }
};

/**
 * Retrieves projects for a given portal ID.
 */
const handleGetProjects = async (socket, data) => {
    console.log('[SERVER LOG] handleGetProjects triggered.'); 
    const { activeProfile } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        console.log('[SERVER LOG] Error: Portal ID is missing from profile.');
        return socket.emit('projectsProjectsResult', { success: false, error: 'Portal ID is missing from profile.', data: [] });
    }

    try {
        // --- YOUR WORKING PATH (UNCHANGED) ---
        const path = `/portal/${portalId}/projects`;
        console.log(`[SERVER LOG] Making API call to: ${path}`);
        const response = await makeApiCall('get', path, null, activeProfile, 'projects');

        const projects = Array.isArray(response.data) ? response.data : (response.data.projects || []); 

        socket.emit('projectsProjectsResult', { 
            success: true, 
            data: projects,
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('projectsProjectsResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
            data: []
        });
    }
};

/**
 * Retrieves task lists for a given project.
 */
const handleGetTaskLists = async (socket, data) => {
    console.log('[SERVER LOG] handleGetTaskLists triggered.'); 
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        console.log('[SERVER LOG] Error: Portal ID is missing.');
        return socket.emit('projectsTaskListsResult', { success: false, error: 'Portal ID is missing.', data: [] });
    }

    try {
        // --- YOUR WORKING PATH (UNCHANGED) ---
        const path = `/portal/${portalId}/all-tasklists`;
        const queryParams = projectId ? { project_id: projectId } : {};
        console.log(`[SERVER LOG] Making API call to: ${path} with params:`, queryParams);
        const response = await makeApiCall('get', path, null, activeProfile, 'projects', queryParams);

        const taskLists = response.data.tasklists || [];
        const taskListsArray = Array.isArray(taskLists) ? taskLists : [];

        socket.emit('projectsTaskListsResult', { 
            success: true, 
            data: taskListsArray,
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('projectsTaskListsResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
            data: []
        });
    }
};


/**
 * Retrieves tasks for a given portal.
 */
const handleGetTasks = async (socket, data) => {
    console.log('[SERVER LOG] handleGetTasks triggered.'); 
    const { activeProfile, queryParams = {} } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        console.log('[SERVER LOG] Error: Portal ID is not configured.');
        return socket.emit('projectsTasksResult', { 
            success: false, 
            error: 'Portal ID is not configured for this profile.', 
            data: []
        });
    }

    try {
        // --- YOUR WORKING PATH (UNCHANGED) ---
        const path = `/portal/${portalId}/tasks`;
        console.log(`[SERVER LOG] Making API call to: ${path} with params:`, queryParams);
        
        const response = await makeApiCall('get', path, null, activeProfile, 'projects', queryParams);

        const tasks = response.data.tasks || [];
        const pageInfo = response.data.page_info || {};

        socket.emit('projectsTasksResult', { 
            success: true, 
            data: tasks,
            pageInfo: pageInfo
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('projectsTasksResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
            data: []
        });
    }
};

/**
 * Creates a single task. (Used by REST endpoint and internally by bulk handler)
 */
const handleCreateSingleTask = async (data) => {
    // --- MODIFIED to accept bulkDefaultData ---
    const { portalId, projectId, taskName, taskDescription, tasklistId, selectedProfileName, bulkDefaultData } = data; 
    
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile || !portalId || !projectId || !tasklistId) {
         return { success: false, error: 'Missing profile, portal ID, project ID, or Task List ID.' };
    }

    try {
        // --- YOUR WORKING PATH (UNCHANGED) ---
        const path = `/portal/${portalId}/projects/${projectId}/tasks`;
        
        // --- THIS IS THE FIX ---
        // Start with the base task data
        const taskData = {
            name: taskName,
            tasklist: {
                id: tasklistId
            }
        };

        // Only add description if it's not empty
        if (taskDescription) {
            taskData.description = taskDescription;
        }

        // Add custom fields from bulkDefaultData directly to the taskData object
        if (bulkDefaultData && Object.keys(bulkDefaultData).length > 0) {
            for (const [key, value] of Object.entries(bulkDefaultData)) {
                if (value) { // Only add fields that have a value
                    // This will add "UDF_CHAR82": "your-value" to the top level
                    taskData[key] = value;
                }
            }
            console.log(`[SERVER LOG] Task '${taskName}' submitting with top-level custom fields:`, bulkDefaultData);
        }
        // --- END FIX ---
        
        console.log(`[SERVER LOG] Sending final task payload to ${path}:`, JSON.stringify(taskData));
        const response = await makeApiCall('post', path, taskData, activeProfile, 'projects');
        
        let newTask;
        if (response.data && response.data.id && response.data.name) {
            newTask = response.data;
        } else if (response.data.tasks && Array.isArray(response.data.tasks)) {
            newTask = response.data.tasks[0];
        }

        if (newTask) {
            return { 
                success: true, 
                fullResponse: newTask, 
                message: `Task "${newTask.name}" created successfully.`,
                taskId: newTask.id,
                taskPrefix: newTask.prefix,
            };
        } else {
             return { 
                success: false, 
                error: 'Task creation failed, API response was not in the expected format.',
                fullResponse: response.data,
            };
        }

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};

/**
 * Handles bulk creation of tasks from a list of names.
 */
const handleStartBulkCreateTasks = async (socket, data) => {
    // --- MODIFIED to accept bulkDefaultData ---
    const { taskNames, projectId, taskDescription, tasklistId, delay, selectedProfileName, activeProfile, bulkDefaultData } = data;
    
    console.log(`[PROJECTS JOB START] Profile: ${selectedProfileName}. Project ID: ${projectId}. TaskList ID: ${tasklistId}. Tasks Queued: ${taskNames.length}`);

    const jobId = createJobId(socket.id, selectedProfileName, 'projects');
    activeJobs[jobId] = { status: 'running' };
    const tasksToProcess = taskNames.map(name => name.trim()).filter(t => t.length > 0);

    if (tasksToProcess.length === 0) {
        console.error('[PROJECTS JOB ERROR] No valid task names provided after filtering.');
        return socket.emit('bulkError', { message: 'No valid task names provided.', profileName: selectedProfileName, jobType: 'projects' });
    }
    
    const jobState = activeJobs[jobId] || {};
    jobState.totalToProcess = tasksToProcess.length;


    try {
        if (!activeProfile || !activeProfile.projects?.portalId || !tasklistId) {
            throw new Error('Profile, Portal ID, or Task List ID is missing.');
        }
        
        const portalId = activeProfile.projects.portalId;

        for (let i = 0; i < tasksToProcess.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const taskName = tasksToProcess[i];
            
            console.log(`[PROJECTS JOB] Processing Task ${i + 1}/${tasksToProcess.length}: ${taskName}`);
            
            // --- MODIFIED to pass bulkDefaultData ---
            const result = await handleCreateSingleTask({
                portalId,
                projectId,
                taskName,
                taskDescription,
                tasklistId,
                selectedProfileName,
                bulkDefaultData // Pass the dynamic fields
            });

            if (result.success) {
                console.log(`[PROJECTS JOB SUCCESS] Emitting result for: ${taskName}. Task Prefix: ${result.taskPrefix}`);
                socket.emit('projectsResult', { 
                    projectName: taskName,
                    success: true,
                    details: result.message,
                    fullResponse: result.fullResponse,
                    profileName: selectedProfileName
                });
            } else {
                console.error(`[PROJECTS JOB ERROR] Emitting error for: ${taskName}. Reason: ${result.error}`);
                socket.emit('projectsResult', { 
                    projectName: taskName, 
                    success: false, 
                    error: result.error, 
                    fullResponse: result.fullResponse, 
                    profileName: selectedProfileName 
                });
            }
        }

    } catch (error) {
        console.error('[PROJECTS JOB CRITICAL ERROR]', error.message);
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'projects' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                console.log('[PROJECTS JOB] Job manually ended.');
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'projects' });
            } else {
                console.log('[PROJECTS JOB] Job successfully completed all tasks.');
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'projects' });
            }
            delete activeJobs[jobId];
        }
    }
};


// --- WORKING GET TASK LAYOUT FUNCTION (UNCHANGED) ---
const handleGetTaskLayout = async (socket, data) => {
    console.log('[SERVER LOG] handleGetTaskLayout triggered.');
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        console.log('[SERVER LOG] Error: Portal ID is missing from profile.');
        return socket.emit('projectsTaskLayoutResult', { success: false, error: 'Portal ID is missing from profile.' });
    }
    if (!projectId) {
        console.log('[SERVER LOG] Error: Project ID not provided.');
        return socket.emit('projectsTaskLayoutResult', { success: false, error: 'Project ID not provided.' });
    }

    try {
        // Step 1: Get JUST the token.
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        
        // Step 2: Manually build the correct URL from your Postman test
        const domain = 'https://projectsapi.zoho.com'; // Hard-coded correct domain
        // --- REMOVED THE TRAILING SLASH ---
        const apiUrl = `${domain}/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;
        
        console.log(`[SERVER LOG] Bypassing makeApiCall. Manually calling: ${apiUrl}`);

        // Step 3: Make a direct axios call with the correct URL and token
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${access_token}`
            }
        });
        
        // The response you posted is the layout object itself
        const layout = response.data; 

        if (!layout || !layout.layout_id) {
             console.log('[SERVER LOG] Error: No task layout found in response.');
             throw new Error('No task layout found for this project.');
        }

        console.log(`[SERVER LOG] Successfully fetched layout: ${layout.layout_id}`);
        socket.emit('projectsTaskLayoutResult', { 
            success: true, 
            data: layout, // Send the layout object
        });

    } catch (error) {
        // Manually parse the error since we aren't using parseError
        console.error('[SERVER LOG] Error in manual axios call for task layout:', error.message);
        let message = error.message;
        let fullResponse = null;
        if (error.response) {
            // Log the detailed error from Zoho
            console.error('[SERVER LOG] Zoho API Error Details:', JSON.stringify(error.response.data));
            message = error.response.data?.error?.details?.[0]?.message || error.response.data?.message || error.response.data?.error?.message || error.message;
            fullResponse = error.response.data;
        }
        
        socket.emit('projectsTaskLayoutResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
        });
    }
};
// --- END OF FUNCTION ---


module.exports = {
    setActiveJobs,
    handleGetPortals,
    handleGetProjects,
    handleGetTaskLists,
    handleGetTasks,
    handleCreateSingleTask,
    handleStartBulkCreateTasks,
    handleGetTaskLayout, 
};