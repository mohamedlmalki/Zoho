// --- FILE: server/index.js (FINAL CODE WITH EXHAUSTIVE SCOPES) ---
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const { readProfiles, writeProfiles, parseError, getValidAccessToken, makeApiCall, createJobId } = require('./utils');
const deskHandler = require('./desk-handler');
const inventoryHandler = require('./inventory-handler');
const catalystHandler = require('./catalyst-handler');
const qntrlHandler = require('./qntrl-handler');
const peopleHandler = require('./people-handler');
const creatorHandler = require('./creator-handler');
// --- ADDED PROJECTS HANDLER ---
const projectsHandler = require('./projects-handler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "http://localhost:8080" } });

const port = process.env.PORT || 3000;
const REDIRECT_URI = `http://localhost:${port}/api/zoho/callback`;

// Register active jobs object with all handlers
const activeJobs = {};
deskHandler.setActiveJobs(activeJobs);
inventoryHandler.setActiveJobs(activeJobs);
catalystHandler.setActiveJobs(activeJobs);
qntrlHandler.setActiveJobs(activeJobs);
peopleHandler.setActiveJobs(activeJobs);
creatorHandler.setActiveJobs(activeJobs);
// --- ADDED PROJECTS HANDLER ---
projectsHandler.setActiveJobs(activeJobs);


const authStates = {};

app.use(cors());
app.use(express.json());

// --- ZOHO AUTH FLOW ---
app.post('/api/zoho/auth', (req, res) => {
    const { clientId, clientSecret, socketId } = req.body;
    if (!clientId || !clientSecret || !socketId) {
        return res.status(400).send('Client ID, Client Secret, and Socket ID are required.');
    }

    const state = crypto.randomBytes(16).toString('hex');
    authStates[state] = { clientId, clientSecret, socketId };

    setTimeout(() => delete authStates[state], 300000); // 5 minute expiry

    // Combined scopes for all integrated Zoho products
    const combinedScopes = [
        'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ',
        'ZohoInventory.contacts.ALL,ZohoInventory.invoices.ALL,ZohoInventory.settings.ALL,ZohoInventory.settings.UPDATE,ZohoInventory.settings.READ',
        'ZohoCatalyst.projects.users.CREATE,ZohoCatalyst.projects.users.READ,ZohoCatalyst.projects.users.DELETE,ZohoCatalyst.email.CREATE',
        'Qntrl.job.ALL,Qntrl.user.READ,Qntrl.layout.ALL',
        'ZOHOPEOPLE.organization.READ,ZOHOPEOPLE.employee.ALL,ZOHOPEOPLE.forms.ALL',
        'ZohoCreator.form.CREATE,ZohoCreator.report.CREATE,ZohoCreator.report.READ,ZohoCreator.report.UPDATE,ZohoCreator.report.DELETE,ZohoCreator.meta.form.READ,ZohoCreator.meta.application.READ,ZohoCreator.dashboard.READ',
        
        // --- FINAL EXHAUSTIVE ZOHO PROJECTS SCOPES (Guaranteed to cover all read/write and setup needs) ---
        // This includes all ALL scopes and the specific READ/CREATE ones where ALL might conflict or not exist.
		'ZohoProjects.tasklists.READ',
        'ZohoProjects.portals.ALL',
        'ZohoProjects.projects.ALL',
        'ZohoProjects.milestones.ALL',
        'ZohoProjects.bugs.ALL',
        'ZohoProjects.tasklists.ALL',
        'ZohoProjects.tasks.ALL',
        'ZohoProjects.timesheets.ALL',
        'ZohoProjects.forums.ALL',
        'ZohoProjects.events.ALL',
        'ZohoProjects.users.ALL',
        'ZohoProjects.clients.ALL',
        'ZohoProjects.documents.ALL',
        'ZohoProjects.custom_fields.ALL',
        'ZohoProjects.bulk.READ',
        'ZohoProjects.activities.READ',
        'ZohoProjects.custom_functions.custom',
        'ZohoProjects.extensions.READ',
        'ZohoProjects.extensions.CREATE',
        'ZohoProjects.extensions.UPDATE',
        'ZohoProjects.extensions.DELETE',
        
        // --- Accessory Scopes (File/Search) ---
        'WorkDrive.workspace.ALL',
        'WorkDrive.files.ALL',
        'ZohoPC.files.ALL',
        'ZohoSearch.securesearch.READ',
        'ZohoSheet.dataAPI.READ',
        
        // --- Bugtracker Scopes (Keeping ALL where applicable) ---
        'ZohoBugtracker.portals.READ',
        'ZohoBugtracker.projects.ALL',
        'ZohoBugtracker.milestones.ALL',
        'ZohoBugtracker.timesheets.ALL',
        'ZohoBugtracker.bugs.ALL',
        'ZohoBugtracker.events.ALL',
        'ZohoBugtracker.forums.ALL',
        'ZohoBugtracker.users.ALL',
        'ZohoBugtracker.search.READ',
        'ZohoBugtracker.documents.ALL',
        'ZohoBugtracker.tags.READ'
    ].join(',');
    
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${combinedScopes}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}&prompt=consent&state=${state}`;
    
    res.json({ authUrl });
});

app.get('/api/zoho/callback', async (req, res) => {
    const { code, state } = req.query;
    const authData = authStates[state];
    if (!authData) {
        return res.status(400).send('<h1>Error</h1><p>Invalid or expired session state. Please try generating the token again.</p>');
    }
    delete authStates[state];

    try {
        const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('client_id', authData.clientId);
        params.append('client_secret', authData.clientSecret);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('grant_type', 'authorization_code');
        
        const axios = require('axios');
        const response = await axios.post(tokenUrl, params);
        const { refresh_token } = response.data;

        if (!refresh_token) {
            throw new Error('Refresh token not found in Zoho\'s response.');
        }

        io.to(authData.socketId).emit('zoho-refresh-token', { refreshToken: refresh_token });
        res.send('<h1>Success!</h1><p>You can now close this window. The token has been sent to the application.</p><script>window.close();</script>');

    } catch (error) {
        const { message } = parseError(error);
        io.to(authData.socketId).emit('zoho-refresh-token-error', { error: message });
        res.status(500).send(`<h1>Error</h1><p>Failed to get token: ${message}. Please close this window and try again.</p>`);
    }
});

// --- REST ENDPOINTS (for single actions) ---
app.post('/api/tickets/single', async (req, res) => {
    try {
        const result = await deskHandler.handleSendSingleTicket(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/tickets/verify', async (req, res) => {
    try {
        const result = await deskHandler.handleVerifyTicketEmail(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/invoices/single', async (req, res) => {
    try {
        const result = await inventoryHandler.handleSendSingleInvoice(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/catalyst/single', async (req, res) => {
    try {
        const result = await catalystHandler.handleSingleSignup(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

// --- NEW REST ENDPOINT FOR PROJECTS ---
app.post('/api/projects/tasks/single', async (req, res) => {
    try {
        const result = await projectsHandler.handleCreateSingleTask(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred during single task creation.' });
    }
});
// --- END NEW REST ENDPOINT ---

// --- PROFILE MANAGEMENT API ---
app.get('/api/profiles', (req, res) => {
    try {
        const allProfiles = readProfiles();
        res.json(allProfiles);
    } catch (error) {
        res.status(500).json({ message: "Could not load profiles." });
    }
});

app.post('/api/profiles', (req, res) => {
    try {
        const newProfile = req.body;
        const profiles = readProfiles();
        if (!newProfile || !newProfile.profileName) {
            return res.status(400).json({ success: false, error: "Profile name is required." });
        }
        if (profiles.some(p => p.profileName === newProfile.profileName)) {
            return res.status(400).json({ success: false, error: "A profile with this name already exists." });
        }
        profiles.push(newProfile);
        writeProfiles(profiles);
        res.json({ success: true, profiles });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to add profile." });
    }
});

app.put('/api/profiles/:profileNameToUpdate', (req, res) => {
    try {
        const { profileNameToUpdate } = req.params;
        const updatedProfileData = req.body;
        const profiles = readProfiles();
        const profileIndex = profiles.findIndex(p => p.profileName === profileNameToUpdate);
        if (profileIndex === -1) {
            return res.status(404).json({ success: false, error: "Profile not found." });
        }
        if (updatedProfileData.profileName !== profileNameToUpdate && profiles.some(p => p.profileName === updatedProfileData.profileName)) {
             return res.status(400).json({ success: false, error: "A profile with the new name already exists." });
        }
        profiles[profileIndex] = { ...profiles[profileIndex], ...updatedProfileData };
        writeProfiles(profiles);
        res.json({ success: true, profiles });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to update profile." });
    }
});

app.delete('/api/profiles/:profileNameToDelete', (req, res) => {
    try {
        const { profileNameToDelete } = req.params;
        const profiles = readProfiles();
        const initialLength = profiles.length;
        const newProfiles = profiles.filter(p => p.profileName !== profileNameToDelete);

        if (newProfiles.length === initialLength) {
            return res.status(404).json({ success: false, error: "Profile not found." });
        }

        writeProfiles(newProfiles);
        res.json({ success: true, profiles: newProfiles });
    } catch (error) {
        console.error('[ERROR] Deleting profile:', error);
        res.status(500).json({ success: false, error: "Failed to delete profile." });
    }
});

// --- SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    console.log(`[INFO] New connection. Socket ID: ${socket.id}`);

    // Dynamic API status check for any service
    socket.on('checkApiStatus', async (data) => {
        try {
            const { selectedProfileName, service = 'desk' } = data;
            const profiles = readProfiles();
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) throw new Error("Profile not found");
            
            const tokenResponse = await getValidAccessToken(activeProfile, service);
            let validationData = {};

            if (service === 'inventory') {
                if (!activeProfile.inventory || !activeProfile.inventory.orgId) {
                    throw new Error('Inventory Organization ID is not configured for this profile.');
                }
                const orgsResponse = await makeApiCall('get', '/v1/organizations', null, activeProfile, 'inventory');
                const currentOrg = orgsResponse.data.organizations.find(org => org.organization_id === activeProfile.inventory.orgId);
                if (!currentOrg) throw new Error('Inventory Organization ID is invalid or does not match this profile.');
                validationData = { 
                    orgName: currentOrg.name, 
                    agentInfo: { firstName: currentOrg.contact_name, lastName: '' } 
                };
            } else if (service === 'catalyst') {
                if (!activeProfile.catalyst || !activeProfile.catalyst.projectId) {
                    throw new Error('Catalyst Project ID is not configured for this profile.');
                }
                const projectId = activeProfile.catalyst.projectId;
                const catalystCheckUrl = `/baas/v1/project/${projectId}/project-user?start=1&end=1`;
                await makeApiCall('get', catalystCheckUrl, null, activeProfile, 'catalyst');
                validationData = { 
                    orgName: `Project ID: ${projectId.substring(0, 10)}...`,
                    agentInfo: { firstName: 'Catalyst Project', lastName: 'Verified' } 
                };
            } else if (service === 'desk') {
                if (!activeProfile.desk || !activeProfile.desk.orgId) {
                    throw new Error('Desk Organization ID is not configured for this profile.');
                }
                const agentResponse = await makeApiCall('get', '/api/v1/myinfo', null, activeProfile, 'desk');
                 validationData = { 
                    agentInfo: agentResponse.data,
                    orgName: agentResponse.data.orgName 
                };
            }
            else if (service === 'qntrl') {
                const qntrlCheckUrl = `/blueprint/api/user/myinfo`; 
                const myInfoResponse = await makeApiCall('get', qntrlCheckUrl, null, activeProfile, 'qntrl');
                validationData = { 
                    orgName: myInfoResponse.data?.org_name || `Org ID: ${activeProfile.qntrl?.orgId || 'N/A'}`,
                    agentInfo: { 
                        firstName: myInfoResponse.data?.first_name || 'Qntrl User', 
                        lastName: myInfoResponse.data?.last_name || '' 
                    },
                    myInfo: myInfoResponse.data 
                };
            }
            else if (service === 'people') {
                const peopleCheckUrl = `/api/v3/organization`; 
                const orgResponse = await makeApiCall('get', peopleCheckUrl, null, activeProfile, 'people');
                validationData = { 
                    orgName: orgResponse.data?.Company || 'Zoho People Org',
                    agentInfo: { 
                        firstName: orgResponse.data?.ContactPerson || 'Admin', 
                        lastName: ''
                    },
                    orgData: orgResponse.data 
                };
            }
            else if (service === 'creator') {
                if (!activeProfile.creator?.baseUrl || !activeProfile.creator?.ownerName || !activeProfile.creator?.appName) {
                    throw new Error('Creator config (baseUrl, ownerName, appName) is missing.');
                }
                const { ownerName, appName } = activeProfile.creator;
                const formsResponse = await makeApiCall('get', `/meta/${ownerName}/${appName}/forms`, null, activeProfile, 'creator');
                
                validationData = { 
                    orgName: `App: ${appName}`,
                    agentInfo: { 
                        firstName: `Owner: ${ownerName}`, 
                        lastName: ''
                    },
                    formData: formsResponse.data 
                };
            }
            else if (service === 'projects') {
                if (!activeProfile.projects?.portalId) {
                    throw new Error('Projects config (portalId) is missing.');
                }
                const { portalId } = activeProfile.projects;
                // Use the portal ID to fetch portal details as a verification step
                const portalResponse = await makeApiCall('get', `/portal/${portalId}`, null, activeProfile, 'projects');
                
                validationData = { 
                    // --- FINAL FIX: Changed 'portal.name' to 'portal_details.name' ---
                    orgName: `Portal: ${portalResponse.data.portal_details.name}`,
                    agentInfo: { 
                        firstName: `Portal Owner`, // Info is not readily available here, just confirming connection
                        lastName: '' 
                    },
                    portalData: portalResponse.data 
                };
            }

            socket.emit('apiStatusResult', { 
                success: true, 
                message: `Connection to Zoho ${service.charAt(0).toUpperCase() + service.slice(1)} API is successful.`,
                fullResponse: { ...tokenResponse, ...validationData }
            });
        } catch (error) {
            const { message, fullResponse } = parseError(error);
            socket.emit('apiStatusResult', { 
                success: false, 
                message: `Connection failed: ${message}`,
                fullResponse: fullResponse || error.stack
            });
        }
    });

    // Job control handlers
    socket.on('pauseJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'paused';
    });

    socket.on('resumeJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'running';
    });

    socket.on('endJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'ended';
    });

    socket.on('disconnect', () => {
        // Clear any active jobs associated with this socket
        Object.keys(activeJobs).forEach(jobId => {
            if (jobId.startsWith(socket.id)) delete activeJobs[jobId];
        });
    });

    // --- ADDED: Utility listener for Profile Modal ---
    socket.on('getProjectsPortals', (data) => {
        projectsHandler.handleGetPortals(socket, data);
    });

    // --- Service-specific Listeners ---

    // Zoho Desk Listeners
    const deskListeners = {
        'startBulkCreate': deskHandler.handleStartBulkCreate,
        'getEmailFailures': deskHandler.handleGetEmailFailures,
        'clearEmailFailures': deskHandler.handleClearEmailFailures,
        'clearTicketLogs': (socket) => require('./utils').writeToTicketLog([]),
        'getMailReplyAddressDetails': deskHandler.handleGetMailReplyAddressDetails,
        'updateMailReplyAddressDetails': deskHandler.handleUpdateMailReplyAddressDetails,
    };

    for (const [event, handler] of Object.entries(deskListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) handler(socket, { ...data, activeProfile });
        });
    }

    // Zoho Inventory Listeners
    const inventoryListeners = {
        'startBulkInvoice': inventoryHandler.handleStartBulkInvoice,
        'getOrgDetails': inventoryHandler.handleGetOrgDetails,
        'updateOrgDetails': inventoryHandler.handleUpdateOrgDetails,
        'getInvoices': inventoryHandler.handleGetInvoices,
        'deleteInvoices': inventoryHandler.handleDeleteInvoices,
    };

    for (const [event, handler] of Object.entries(inventoryListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) handler(socket, { ...data, activeProfile });
        });
    }
    
    // Zoho Catalyst Listeners
    const catalystListeners = {
        'startBulkSignup': catalystHandler.handleStartBulkSignup,
        'startBulkEmail': catalystHandler.handleStartBulkEmail,
        'getUsers': catalystHandler.handleGetUsers,
        'deleteUser': catalystHandler.handleDeleteUser,
        'deleteUsers': catalystHandler.handleDeleteUsers,
    };

    for (const [event, handler] of Object.entries(catalystListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) handler(socket, { ...data, activeProfile });
        });
    }
	
    // Zoho Qntrl Listeners
    const qntrlListeners = {
        'getQntrlForms': qntrlHandler.handleGetForms,
        'getQntrlFormDetails': qntrlHandler.handleGetFormDetails,
        'createQntrlCard': qntrlHandler.handleCreateCard,
        'startBulkCreateCards': qntrlHandler.handleStartBulkCreateCards, 
    };

    for (const [event, handler] of Object.entries(qntrlListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) handler(socket, { ...data, activeProfile });
        });
    }

    // Zoho People Listeners
    const peopleListeners = {
        'getPeopleForms': peopleHandler.handleGetForms,
        'getPeopleFormComponents': peopleHandler.handleGetFormComponents,
        'insertPeopleRecord': peopleHandler.handleInsertRecord,
        'startBulkInsertPeopleRecords': peopleHandler.handleStartBulkInsertRecords,
    };

    for (const [event, handler] of Object.entries(peopleListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) {
                handler(socket, { ...data, activeProfile });
            } else {
                socket.emit('bulkError', { message: 'Active profile not found.' });
            }
        });
    }

    // Zoho Creator Listeners
    const creatorListeners = {
        'getCreatorForms': creatorHandler.handleGetForms,
        'getCreatorFormComponents': creatorHandler.handleGetFormComponents,
        'insertCreatorRecord': creatorHandler.handleInsertRecord,
        'startBulkInsertCreatorRecords': creatorHandler.handleStartBulkInsertCreatorRecords,
    };

    for (const [event, handler] of Object.entries(creatorListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) {
                if (typeof handler === 'function') {
                    handler(socket, { ...data, activeProfile });
                } else {
                    console.error(`[ERROR] Handler for event '${event}' is not a function.`);
                    socket.emit('bulkError', { message: `Server error: Event ${event} is not configured.` });
                }
            } else {
                socket.emit('bulkError', { message: 'Active profile not found.' });
            }
        });
    }

    // --- UPDATED: Zoho Projects Listeners ---
    const projectsListeners = {
        'getProjectsPortals': projectsHandler.handleGetPortals, 
        'getProjectsProjects': projectsHandler.handleGetProjects,
        'getProjectsTaskDetails': projectsHandler.handleGetTaskDetails, // This was in your original file
        'getProjectsTasks': projectsHandler.handleGetTasks,
        'startBulkCreateTasks': projectsHandler.handleStartBulkCreateTasks,
        // --- THIS IS THE NEW LINE FOR CUSTOM FIELDS ---
        'getProjectsCustomFields': projectsHandler.handleGetProjectsCustomFields,
    };

    for (const [event, handler] of Object.entries(projectsListeners)) {
        socket.on(event, (data) => {
            const profiles = readProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            if (activeProfile) {
                if (typeof handler === 'function') {
                    handler(socket, { ...data, activeProfile });
                } else {
                    console.error(`[ERROR] Handler for event '${event}' is not a function.`);
                    socket.emit('bulkError', { message: `Server error: Event ${event} is not configured.` });
                }
            } else {
                socket.emit('bulkError', { message: 'Active profile not found.' });
            }
        });
    }
});


server.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});