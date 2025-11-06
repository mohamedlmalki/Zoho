// --- FILE: server/projects-handler.js (MODIFIED) ---

const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
// --- NEW: Import URLSearchParams ---
const { URLSearchParams } = require('url');

let activeJobs = {};

const setActiveJobs = (jobs) => {
    activeJobs = jobs;
};

// --- Utility function for job control ---
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
    const { activeProfile } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        return socket.emit('projectsProjectsResult', { success: false, error: 'Portal ID is missing from profile.', data: [] });
    }

    try {
        const path = `/portal/${portalId}/projects`;
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
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        return socket.emit('projectsTaskListsResult', { success: false, error: 'Portal ID is missing.', data: [] });
    }

    try {
        const path = `/portal/${portalId}/all-tasklists`;
        const queryParams = projectId ? { project_id: projectId } : {};
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
    const { activeProfile, queryParams = {} } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        return socket.emit('projectsTasksResult', { 
            success: false, 
            error: 'Portal ID is not configured for this profile.', 
            data: []
        });
    }

    try {
        const path = `/portal/${portalId}/tasks`;
        
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

// --- NEW FUNCTION TO GET CUSTOM FIELDS ---
const handleGetProjectsCustomFields = async (socket, data) => {
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        return socket.emit('projectsCustomFieldsResult', { success: false, error: 'Portal ID is missing from profile.', fields: [] });
    }
    if (!projectId) {
        return socket.emit('projectsCustomFieldsResult', { success: false, error: 'Project ID is required.', fields: [] });
    }

    try {
        const path = `/portal/${portalId}/projects/${projectId}/customfields/`;
        const response = await makeApiCall('get', path, null, activeProfile, 'projects');

        // Flatten the complex layout structure from the API response
        const customFields = response.data.customfield_layout
                                .map(layout => layout.sections.map(sec => sec.fields))
                                .flat(2); // Flattens the array of arrays of arrays

        socket.emit('projectsCustomFieldsResult', { 
            success: true, 
            fields: customFields,
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('projectsCustomFieldsResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
            fields: []
        });
    }
};
// --- END NEW FUNCTION ---

/**
 * Creates a single task. (Used by REST endpoint and internally by bulk handler)
 */
// --- MODIFIED TO HANDLE CUSTOM FIELDS ---
const handleCreateSingleTask = async (data) => {
    // Add custom_fields to destructuring
    const { portalId, projectId, taskName, taskDescription, tasklistId, selectedProfileName, custom_fields } = data; 
    
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile || !portalId || !projectId || !tasklistId) {
         return { success: false, error: 'Missing profile, portal ID, project ID, or Task List ID.' };
    }

    try {
        const path = `/portal/${portalId}/projects/${projectId}/tasks`;
        
        // --- FIX: Use URLSearchParams to send form-urlencoded data ---
        // This is more reliable for custom fields.
        const taskData = new URLSearchParams();
        taskData.append('name', taskName);
        if (taskDescription) {
            taskData.append('description', taskDescription);
        }
        
        // --- FIX: Use tasklist_id param instead of nested object ---
        taskData.append('tasklist_id', tasklistId); 
        // --- END FIX ---
        
        // --- NEW: Add custom fields to the request ---
        if (custom_fields) {
            for (const [key, value] of Object.entries(custom_fields)) {
                // Only append if a value was provided and is not null/undefined
                if (value !== null && value !== undefined && value !== '') { 
                    taskData.append(key, value);
                }
            }
        }
        // --- END NEW ---

        const response = await makeApiCall('post', path, taskData, activeProfile, 'projects');
        
        // --- FIX #2: Check for the direct task object in the response (from your file) ---
        let newTask;
        if (response.data && response.data.id && response.data.name) {
            newTask = response.data;
        } else if (response.data.tasks && Array.isArray(response.data.tasks)) {
            newTask = response.data.tasks[0];
        }
        // --- END FIX #2 ---

        if (newTask) { // This will now be true
            return { 
                success: true, 
                fullResponse: newTask, // This will now send the correct task object
                message: `Task "${newTask.name}" created successfully.`,
                taskId: newTask.id,
                taskPrefix: newTask.prefix,
            };
        } else {
             return { 
                success: false, 
                error: 'Task creation failed, API response was not in the expected format.', // Updated error
                fullResponse: response.data,
            };
        }

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};
// --- END MODIFICATION ---

/**
 * Handles bulk creation of tasks from a list of names.
 */
// --- MODIFIED TO HANDLE CUSTOM FIELDS ---
const handleStartBulkCreateTasks = async (socket, data) => {
    // Add custom_fields to destructuring
    const { taskNames, projectId, taskDescription, tasklistId, delay, selectedProfileName, activeProfile, custom_fields } = data;
    
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
            
            // --- MODIFIED: Pass custom_fields to the single task handler ---
            const result = await handleCreateSingleTask({
                portalId,
                projectId,
                taskName,
                taskDescription,
                tasklistId,
                selectedProfileName,
                custom_fields, // Pass the custom fields object
            });
            // --- END MODIFICATION ---

            if (result.success) {
                console.log(`[PROJECTS JOB SUCCESS] Emitting result for: ${taskName}. Task Prefix: ${result.taskPrefix}`);
                socket.emit('projectsResult', { 
                    projectName: taskName, // Using name as the key
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
// --- END MODIFICATION ---


module.exports = {
    setActiveJobs,
    handleGetPortals,
    handleGetProjects,
    handleGetTaskLists,
    handleGetTasks,
    handleCreateSingleTask,
    handleStartBulkCreateTasks,
    handleGetProjectsCustomFields, // --- NEW EXPORT ---
};