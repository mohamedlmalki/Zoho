// --- FILE: apps/ops/server/projects-handler.js ---

const { getValidAccessToken, makeApiCall, parseError, createJobId, readProfiles } = require('./utils');
const { delay } = require('./utils'); 
const axios = require('axios'); 

let activeJobs = {};

// --- Private Helper 1: Gets the "map" of { column_name: api_name } ---
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
        
        apiNameMap["name"] = "name"; 
        
        console.log(`[SERVER LOG] getApiNameMap: Map created successfully. Keys: ${Object.keys(apiNameMap).length}`);
        return apiNameMap; 

    } catch (error) {
        console.error('[SERVER LOG] Error in getApiNameMap:', error.message);
        throw new Error(`Failed to get task layout map: ${parseError(error).message}`);
    }
}

// --- Private Helper 2: Builds the "smart" V3 payload ---
function buildSmartV3Payload(data, apiNameMap) {
    const { taskName, taskDescription, tasklistId, bulkDefaultData } = data;
    
    const payload = {
        name: taskName, 
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
                // console.log(`[SERVER LOG] buildSmartV3Payload: Translating ${columnName} -> ${apiName}`);
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

// --- API HANDLERS ---

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
        socket.emit('projectsTasksResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
            data: []
        });
    }
};

// --- UPDATED SINGLE TASK HANDLER ---
const handleCreateSingleTask = async (data, providedMap = null) => {
    const { portalId, projectId, tasklistId, selectedProfileName } = data; 
    
    const profiles = readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile || !portalId || !projectId || !tasklistId) {
         return { success: false, error: 'Missing profile, portal ID, project ID, or Task List ID.' };
    }

    try {
        const path = `/portal/${portalId}/projects/${projectId}/tasks`;
        
        // 1. Get Map (use provided one if available to save time)
        const apiNameMap = providedMap || await getApiNameMap(portalId, projectId, activeProfile);
        
        // 2. Build Payload
        const taskData = buildSmartV3Payload(data, apiNameMap);
        
        // 3. --- NEW: Build Reverse Map for Logging (API Name -> Label) ---
        // This ensures the logs show "Due Date" instead of "end_date"
        const reverseMap = {};
        if (apiNameMap) {
            Object.entries(apiNameMap).forEach(([label, apiName]) => {
                // Key = api_name, Value = Label
                reverseMap[apiName] = label;
            });
        }
        // -----------------------------------------------------------------

        console.log(`[SERVER LOG] Sending final V3 "smart" payload to ${path}:`, JSON.stringify(taskData));

        // 4. Pass reverseMap as the last argument (logExtras)
        const response = await makeApiCall('post', path, taskData, activeProfile, 'projects', {}, reverseMap);
        
        let newTask;
        if (response.data && response.data.id && response.data.name) {
            newTask = response.data;
        } else if (response.data.tasks && Array.isArray(response.data.tasks) && response.data.tasks.length > 0) {
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

// --- UPDATED BULK HANDLER (OPTIMIZED) ---
const handleStartBulkCreateTasks = async (socket, data) => {
    const { formData, selectedProfileName, activeProfile } = data;
    const { 
        taskName, 
        primaryField, 
        primaryValues, 
        projectId, 
        taskDescription, 
        tasklistId, 
        delay, 
        bulkDefaultData,
        stopAfterFailures = 0 
    } = formData;
    
    console.log(`[PROJECTS JOB START] Profile: ${selectedProfileName}. Project ID: ${projectId}. Primary Field: ${primaryField}.`);

    const jobId = createJobId(socket.id, selectedProfileName, 'projects');
    
    activeJobs[jobId] = { 
        status: 'running',
        consecutiveFailures: 0,
        stopAfterFailures: Number(stopAfterFailures) 
    };
    
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

        // --- OPTIMIZATION: Fetch Map ONCE ---
        console.log('[PROJECTS JOB] Fetching Field Map ONCE for bulk job...');
        const sharedApiNameMap = await getApiNameMap(portalId, projectId, activeProfile);
        // ------------------------------------

        for (let i = 0; i < tasksToProcess.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (activeJobs[jobId].stopAfterFailures > 0 && 
                activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                 
                 if (activeJobs[jobId].status !== 'paused') {
                     activeJobs[jobId].status = 'paused';
                     socket.emit('jobPaused', { 
                        profileName: selectedProfileName, 
                        reason: `Paused automatically after ${activeJobs[jobId].consecutiveFailures} consecutive failures.` 
                     });
                 }
                 while (activeJobs[jobId]?.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 500));
                 }
            }

            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const currentValue = tasksToProcess[i];
            
            let taskNameForThisIteration = '';
            const dataForThisTask = { ...bulkDefaultData }; 

            if (primaryField === 'name') {
                taskNameForThisIteration = currentValue;
            } else {
                taskNameForThisIteration = `${taskName}_${i + 1}`;
                dataForThisTask[primaryField] = currentValue; 
            }

            console.log(`[PROJECTS JOB] Processing Task ${i + 1}/${tasksToProcess.length}: ${taskNameForThisIteration}`);
            
            const result = await handleCreateSingleTask({
                portalId,
                projectId,
                taskName: taskNameForThisIteration, 
                taskDescription,
                tasklistId,
                selectedProfileName,
                bulkDefaultData: dataForThisTask 
            }, sharedApiNameMap); // <--- PASS THE MAP HERE
            
            if (result.success) {
                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;

                socket.emit('projectsResult', { 
                    projectName: currentValue, 
                    success: true,
                    details: result.message,
                    fullResponse: result.fullResponse,
                    profileName: selectedProfileName
                });
            } else {
                if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures++;

                socket.emit('projectsResult', { 
                    projectName: currentValue, 
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
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'projects' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'projects' });
            }
            delete activeJobs[jobId];
        }
    }
};

const handleGetTaskLayout = async (socket, data) => {
    console.log('[SERVER LOG] handleGetTaskLayout triggered.');
    const { activeProfile, projectId } = data;
    const portalId = activeProfile.projects?.portalId;
    
    if (!portalId) {
        return socket.emit('projectsTaskLayoutResult', { success: false, error: 'Portal ID is missing from profile.' });
    }
    if (!projectId) {
        return socket.emit('projectsTaskLayoutResult', { success: false, error: 'Project ID not provided.' });
    }

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        const apiUrl = `${domain}/restapi/portal/${portalId}/projects/${projectId}/tasklayouts`;
        
        console.log(`[SERVER LOG] Bypassing makeApiCall. Manually calling: ${apiUrl}`);

        const response = await axios.get(apiUrl, {
            headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }
        });
        
        const layout = response.data; 

        if (!layout || !layout.layout_id) {
             throw new Error('No task layout found for this project.');
        }

        socket.emit('projectsTaskLayoutResult', { 
            success: true, 
            data: layout, 
        });

    } catch (error) {
        console.error('[SERVER LOG] Error in manual axios call for task layout:', error.message);
        let message = error.message;
        let fullResponse = null;
        if (error.response) {
            message = error.response.data?.error?.details?.[0]?.message || error.response.data?.message || error.message;
            fullResponse = error.response.data;
        }
        socket.emit('projectsTaskLayoutResult', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
        });
    }
};

const handleGetProjectDetails = async (socket, data) => {
    console.log('[SERVER LOG] handleGetProjectDetails: Triggered with data:', data);
    const { activeProfile, portalId, projectId } = data;

    if (!portalId || !projectId) {
        return socket.emit('projectsProjectDetailsError', { success: false, error: 'Portal ID or Project ID is missing.' });
    }

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        const apiUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}`;
        
        const response = await axios.get(apiUrl, {
            headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }
        });
        
        socket.emit('projectsProjectDetailsResult', { 
            success: true, 
            data: response.data,
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('projectsProjectDetailsError', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
        });
    }
};

const handleUpdateProjectDetails = async (socket, data) => {
    console.log('[SERVER LOG] handleUpdateProjectDetails: Triggered with data:', data);
    const { activeProfile, portalId, projectId, payload } = data; 

    if (!portalId || !projectId || !payload) {
        return socket.emit('projectsUpdateProjectError', { success: false, error: 'Portal ID, Project ID, or payload is missing.' });
    }

    try {
        const { access_token } = await getValidAccessToken(activeProfile, 'projects');
        const domain = 'https://projectsapi.zoho.com';
        const apiUrl = `${domain}/api/v3/portal/${portalId}/projects/${projectId}`;
        
        const response = await axios.patch(apiUrl, payload, {
            headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` }
        });
        
        socket.emit('projectsUpdateProjectResult', { 
            success: true, 
            data: response.data,
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('projectsUpdateProjectError', { 
            success: false, 
            error: message,
            fullResponse: fullResponse,
        });
    }
};

module.exports = {
    setActiveJobs,
    handleGetPortals,
    handleGetProjects,
    handleGetTaskLists,
    handleGetTasks,
    handleCreateSingleTask,
    handleStartBulkCreateTasks,
    handleGetTaskLayout,
    handleUpdateProjectDetails,
    handleGetProjectDetails
};