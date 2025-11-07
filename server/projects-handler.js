// --- FILE: server/projects-handler.js (CORRECTED) ---

const { makeApiCall, parseError, createJobId } = require('./utils');
let activeJobs = {};

// --- HELPER FUNCTION ---
/**
 * Awaits a specified number of seconds.
 * @param {number} seconds - The number of seconds to wait.
 */
const wait = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

/**
 * Checks the status of a bulk job.
 * @param {string} jobId - The unique identifier for the job.
 * @returns {'running' | 'paused' | 'ended'} The current status of the job.
 */
const checkJobStatus = (jobId) => {
    if (!activeJobs[jobId]) return 'ended';
    return activeJobs[jobId].status;
};

// --- API HANDLERS ---

/**
 * Fetches all portals for the given profile.
 */
const handleGetPortals = async (socket, data) => {
    const { activeProfile } = data;
    try {
        const response = await makeApiCall('get', '/portals', null, activeProfile, 'projects');
        socket.emit('projectsPortalsResult', { success: true, portals: response.data.portals });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsPortalsResult', { success: false, error: message });
    }
};

/**
 * Fetches all projects for the given portal.
 */
const handleGetProjects = async (socket, data) => {
    const { activeProfile } = data;
    if (!activeProfile.projects || !activeProfile.projects.portalId) {
        return socket.emit('projectsProjectsResult', { success: false, error: 'Portal ID not configured for this profile.' });
    }
    const { portalId } = activeProfile.projects;
    
    try {
        const response = await makeApiCall('get', `/portal/${portalId}/projects`, null, activeProfile, 'projects');
        
        // --- LOGGING AS REQUESTED ---
        console.log('--- ZOHO API RESPONSE: PROJECTS ---');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('-----------------------------------');
        
        socket.emit('projectsProjectsResult', { success: true, data: response.data.projects });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsProjectsResult', { success: false, error: message });
    }
};

/**
 * Fetches all task lists for a specific project.
 */
const handleGetTaskLists = async (socket, data) => {
    const { activeProfile, projectId } = data;
    if (!activeProfile.projects || !activeProfile.projects.portalId) {
        return socket.emit('projectsTaskListsResult', { success: false, error: 'Portal ID not configured for this profile.' });
    }
    if (!projectId) {
         return socket.emit('projectsTaskListsResult', { success: false, error: 'Project ID is required to fetch task lists.' });
    }
    
    const { portalId } = activeProfile.projects;
    const url = `/portal/${portalId}/projects/${projectId}/tasklists/`;
    
    try {
        const response = await makeApiCall('get', url, null, activeProfile, 'projects');
        
        console.log('--- ZOHO API RESPONSE: TASK LISTS ---');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('-------------------------------------');

        socket.emit('projectsTaskListsResult', { success: true, data: response.data.tasklists });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsTaskListsResult', { success: false, error: message });
    }
};

/**
 * Fetches tasks, optionally filtered by project_id.
 */
const handleGetTasks = async (socket, data) => {
    const { activeProfile, queryParams } = data; // queryParams might contain project_id
    if (!activeProfile.projects || !activeProfile.projects.portalId) {
        return socket.emit('projectsTasksResult', { success: false, error: 'Portal ID not configured for this profile.' });
    }
    const { portalId } = activeProfile.projects;
    const url = `/portal/${portalId}/tasks/`;
    
    try {
        const response = await makeApiCall('get', url, null, activeProfile, 'projects', queryParams);
        socket.emit('projectsTasksResult', { success: true, data: response.data.tasks });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsTasksResult', { success: false, error: message });
    }
};

/**
 * Fetches details for a single task.
 */
const handleGetTaskDetails = async (socket, data) => {
    const { activeProfile, taskId } = data;
    if (!activeProfile.projects || !activeProfile.projects.portalId) {
        return socket.emit('projectsTaskDetailsResult', { success: false, error: 'Portal ID not configured for this profile.' });
    }
    if (!taskId) {
        return socket.emit('projectsTaskDetailsResult', { success: false, error: 'Task ID is required.' });
    }
    const { portalId } = activeProfile.projects;
    const url = `/portal/${portalId}/tasks/${taskId}/`;
    
    try {
        const response = await makeApiCall('get', url, null, activeProfile, 'projects');
        socket.emit('projectsTaskDetailsResult', { success: true, data: response.data.tasks[0] });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsTaskDetailsResult', { success: false, error: message });
    }
};

/**
 * Fetches custom fields for a specific project.
 */
const handleGetProjectsCustomFields = async (socket, data) => {
    const { activeProfile, projectId } = data;
    if (!activeProfile.projects || !activeProfile.projects.portalId) {
        return socket.emit('projectsCustomFieldsResult', { success: false, error: 'Portal ID not configured for this profile.' });
    }
    if (!projectId) {
         return socket.emit('projectsCustomFieldsResult', { success: false, error: 'Project ID is required to fetch custom fields.' });
    }
    
    const { portalId } = activeProfile.projects;
    const url = `/portal/${portalId}/projects/${projectId}/customfields/`;
    
    try {
        const response = await makeApiCall('get', url, null, activeProfile, 'projects');
        
        console.log('--- ZOHO API RESPONSE: CUSTOM FIELDS ---');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('----------------------------------------');

        socket.emit('projectsCustomFieldsResult', { success: true, fields: response.data.custom_fields });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('projectsCustomFieldsResult', { success: false, error: message });
    }
};

/**
 * Creates a single task. Used by REST API.
 */
const handleCreateSingleTask = async (body, activeProfile) => {
    const { projectId, tasklistId, taskName, taskDescription, custom_fields, emails } = body;
    
    if (!activeProfile || !activeProfile.projects || !activeProfile.projects.portalId) {
        return { success: false, error: 'Portal ID not configured for this profile.' };
    }
    if (!projectId || !tasklistId || !taskName) {
        return { success: false, error: 'Project ID, Task List ID, and Task Name are required.' };
    }
    
    const { portalId } = activeProfile.projects;
    const url = `/portal/${portalId}/projects/${projectId}/tasks/`;
    
    const FormData = require('form-data');
    const form = new FormData();
    form.append('name', taskName);
    form.append('tasklist_id', tasklistId);
    if (taskDescription) form.append('description', taskDescription);
    if (emails) form.append('person_responsible', emails);
    if (custom_fields) {
        form.append('custom_fields', JSON.stringify(custom_fields));
    }
    
    try {
        const response = await makeApiCall('post', url, form, activeProfile, 'projects');
        return { success: true, data: response.data.tasks[0] };
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};

/**
 * Starts a bulk creation job for tasks.
 */
const handleStartBulkCreateTasks = async (socket, data) => {
    const {
        activeProfile,
        taskNames,
        taskDescription,
        projectId,
        tasklistId,
        delay,
        emails,
        custom_fields,
    } = data;
    
    const jobId = createJobId(socket.id, activeProfile.profileName, 'projects');
    activeJobs[jobId] = { status: 'running', processed: 0, total: taskNames.length };
    
    console.log(`[JOB START] ${jobId} - Creating ${taskNames.length} tasks in Project ${projectId}`);

    const { portalId } = activeProfile.projects;
    const url = `/portal/${portalId}/projects/${projectId}/tasks/`;
    
    for (let i = 0; i < taskNames.length; i++) {
        const taskName = taskNames[i];
        try {
            let jobStatus = checkJobStatus(jobId);
            while (jobStatus === 'paused') {
                await wait(2);
                jobStatus = checkJobStatus(jobId);
            }
            if (jobStatus === 'ended') {
                console.log(`[JOB END] ${jobId} - Job ended prematurely by user.`);
                socket.emit('bulkEnded', { profileName: activeProfile.profileName, jobType: 'projects' });
                delete activeJobs[jobId];
                return;
            }

            const FormData = require('form-data');
            const form = new FormData();
            form.append('name', taskName);
            form.append('tasklist_id', tasklistId);
            if (taskDescription) form.append('description', taskDescription);
            if (emails) form.append('person_responsible', emails);
            if (custom_fields && Object.keys(custom_fields).length > 0) {
                form.append('custom_fields', JSON.stringify(custom_fields));
            }

            const response = await makeApiCall('post', url, form, activeProfile, 'projects');
            const createdTask = response.data.tasks[0];
            
            socket.emit('projectsResult', {
                profileName: activeProfile.profileName,
                success: true,
                projectName: taskName, 
                details: `Task created with ID: ${createdTask.id_string}`,
                fullResponse: createdTask
            });
            
            await wait(delay);

        } catch (error) {
            const { message, fullResponse } = parseError(error);
            socket.emit('projectsResult', {
                profileName: activeProfile.profileName,
                success: false,
                projectName: taskName,
                error: message,
                fullResponse: fullResponse
            });
        }
    }
    
    console.log(`[JOB COMPLETE] ${jobId} - Finished processing tasks.`);
    socket.emit('bulkComplete', { profileName: activeProfile.profileName, jobType: 'projects' });
    delete activeJobs[jobId];
};


module.exports = {
    setActiveJobs: (jobs) => { activeJobs = jobs; },
    handleGetPortals,
    handleGetProjects,
    handleGetTaskLists, 
    handleGetTasks,
    handleGetTaskDetails,
    handleGetProjectsCustomFields,
    handleCreateSingleTask,
    handleStartBulkCreateTasks,
};