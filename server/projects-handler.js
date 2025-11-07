// --- FILE: server/projects-handler.js (FULL CODE - FINAL FIX) ---

const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const { delay } = require('./utils'); // Assuming delay is in utils, based on your original file
const axios = require('axios'); 

let activeJobs = {};

// --- NEW HELPER 1: Gets the "map" of { column_name: api_name } ---
async function getApiNameMap(portalId, projectId, activeProfile) {
    console.log(`[SERVER LOG] getApiNameMap: Fetching layout for project ${projectId}`);
    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        const apiUrl = `${domain}/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;

        const response = await axios.get(apiUrl, {
            headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }
        });
        
        const layout = response.data;
        if (!layout || !layout.layout_id) {
            throw new Error('No task layout found for this project.');
        }

        const apiNameMap = {};
        if (layout.section_details) {
            for (const section of layout.section_details) {
                if (section.customfield_details) {
                    for (const field of section.customfield_details) {
                        apiNameMap[field.column_name] = field.api_name;
                    }
                }
            }
        }
        
        // --- ADD "name" to the map manually ---
        // This lets the user select "Task Name" as a primary field
        apiNameMap["name"] = "name"; 
        
        console.log(`[SERVER LOG] getApiNameMap: Map created successfully.`);
        return apiNameMap; 

    } catch (error) {
        console.error('[SERVER LOG] Error in getApiNameMap:', error.message);
        throw new Error(`Failed to get task layout map: ${parseError(error).message}`);
    }
}

// --- NEW HELPER 2: Builds the "smart" V3 payload ---
function buildSmartV3Payload(data, apiNameMap) {
    const { taskName, taskDescription, tasklistId, bulkDefaultData } = data;
    
    const payload = {
        name: taskName, // This is the base/template task name
        tasklist: { id: tasklistId }
    };

    if (taskDescription) {
        payload.description = taskDescription;
    }

    if (bulkDefaultData) {
        for (const [columnName, value] of Object.entries(bulkDefaultData)) {
            if (!value) continue; 
            const apiName = apiNameMap[columnName];
            
            if (apiName) {
                // If the apiName is 'name', it will overwrite the base taskName.
                // This is correct if "Task Name" is the primary field.
                console.log(`[SERVER LOG] buildSmartV3Payload: Translating ${columnName} -> ${apiName}`);
                payload[apiName] = value;
            } else {
                console.warn(`[SERVER LOG] buildSmartV3Payload: No api_name found for ${columnName}. Skipping.`);
            }
        }
    }
    
    return payload;
}


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

// --- UNTOUCHED ORIGINAL FUNCTION ---
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

// --- UNTOUCHED ORIGINAL FUNCTION ---
const handleGetProjects = async (socket, data) => {
    console.log('[SERVER LOG] handleGetProjects triggered.'); 
    const { activeProfile } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        console.log('[SERVER LOG] Error: Portal ID is missing from profile.');
        return socket.emit('projectsProjectsResult', { success: false, error: 'Portal ID is missing from profile.', data: [] });
    }

    try {
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

// --- UNTOUCHED ORIGINAL FUNCTION ---
const handleGetTaskLists = async (socket, data) => {
    console.log('[SERVER LOG] handleGetTaskLists triggered.'); 
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        console.log('[SERVER LOG] Error: Portal ID is missing.');
        return socket.emit('projectsTaskListsResult', { success: false, error: 'Portal ID is missing.', data: [] });
    }

    try {
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


// --- UNTOUCHED ORIGINAL FUNCTION ---
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
        socket.emit('projectsTaskListsResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
            data: []
        });
    }
};

// --- UNTOUCHED (BUT STILL WORKING) "SMART" FUNCTION ---
const handleCreateSingleTask = async (data) => {
    const { portalId, projectId, tasklistId, selectedProfileName } = data; 
    
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile || !portalId || !projectId || !tasklistId) {
         return { success: false, error: 'Missing profile, portal ID, project ID, or Task List ID.' };
    }

    try {
        const path = `/portal/${portalId}/projects/${projectId}/tasks`;
        
        console.log(`[SERVER LOG] Getting API Name Map for project ${projectId}...`);
        const apiNameMap = await getApiNameMap(portalId, projectId, activeProfile);
        
        const taskData = buildSmartV3Payload(data, apiNameMap);
        
        console.log(`[SERVER LOG] Sending final V3 "smart" payload to ${path}:`, JSON.stringify(taskData));

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

// --- MODIFIED: handleStartBulkCreateTasks (to use new logic) ---
const handleStartBulkCreateTasks = async (socket, data) => {
    // Get the new form data
    const { formData, selectedProfileName, activeProfile } = data;
    const { 
        taskName, // This is now a single string
        primaryField, // The "column_name" to bulk, e.g., "name" or "UDF_CHAR82"
        primaryValues, // The list of values
        projectId, 
        taskDescription, 
        tasklistId, 
        delay, 
        bulkDefaultData // The other "default" fields
    } = formData;
    
    console.log(`[PROJECTS JOB START] Profile: ${selectedProfileName}. Project ID: ${projectId}. Primary Field: ${primaryField}.`);

    const jobId = createJobId(socket.id, selectedProfileName, 'projects');
    activeJobs[jobId] = { status: 'running' };
    
    const tasksToProcess = primaryValues.split('\n').map(name => name.trim()).filter(t => t.length > 0);

    if (tasksToProcess.length === 0) {
        console.error('[PROJECTS JOB ERROR] No valid primary values provided after filtering.');
        return socket.emit('bulkError', { message: 'No valid primary values provided.', profileName: selectedProfileName, jobType: 'projects' });
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

            const currentValue = tasksToProcess[i];
            
            // --- THIS IS YOUR NEW LOGIC ---
            let taskNameForThisIteration = '';
            // Create a *new* data object for this specific task
            const dataForThisTask = { ...bulkDefaultData }; 

            if (primaryField === 'name') {
                // If primary field is "Task Name", use the value from the list
                taskNameForThisIteration = currentValue;
            } else {
                // Otherwise, use the template name + suffix
                // And add the primary field/value to the bulk data
                taskNameForThisIteration = `${taskName}_${i + 1}`;
                dataForThisTask[primaryField] = currentValue; // e.g., { "UDF_CHAR82": "test@example.com" }
            }
            // --- END OF YOUR LOGIC ---

            console.log(`[PROJECTS JOB] Processing Task ${i + 1}/${tasksToProcess.length}: ${taskNameForThisIteration}`);
            
            // We call the same "smart" single task function
            const result = await handleCreateSingleTask({
                portalId,
                projectId,
                taskName: taskNameForThisIteration, // Pass the calculated name
                taskDescription,
                tasklistId,
                selectedProfileName,
                bulkDefaultData: dataForThisTask // Pass the combined default + primary data
            });

            if (result.success) {
                console.log(`[PROJECTS JOB SUCCESS] Emitting result for: ${taskNameForThisIteration}.`);
                socket.emit('projectsResult', { 
                    projectName: taskNameForThisIteration, // Use the unique name
                    success: true,
                    details: result.message,
                    fullResponse: result.fullResponse,
                    profileName: selectedProfileName
                });
            } else {
                console.error(`[PROJECTS JOB ERROR] Emitting error for: ${taskNameForThisIteration}. Reason: ${result.error}`);
                socket.emit('projectsResult', { 
                    projectName: taskNameForThisIteration, 
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
// --- END OF MODIFICATION ---


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
        const apiUrl = `${domain}/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;
        
        console.log(`[SERVER LOG] Bypassing makeApiCall. Manually calling: ${apiUrl}`);

        // Step 3: Make a direct axios call with the correct URL and token
        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Zoho-oauthtoken ${access_token}`
            }
        });
        
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
        console.error('[SERVER LOG] Error in manual axios call for task layout:', error.message);
        let message = error.message;
        let fullResponse = null;
        if (error.response) {
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