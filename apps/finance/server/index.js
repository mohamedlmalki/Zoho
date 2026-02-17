const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const { 
    readProfiles, writeProfiles, parseError, getValidAccessToken, makeApiCall, createJobId,
    writeSaveFile, readSaveFile, listSaveFiles // <--- ADDED THESE IMPORTS
} = require('./utils');

// --- HANDLER IMPORTS ---
const inventoryHandler = require('./inventory-handler');
const booksHandler = require('./books-handler');
const customModuleHandler = require('./custom-module-handler');
const expenseHandler = require('./expense-handler');
const booksCustomHandler = require('./books-custom-handler');
const billingHandler = require('./billing-handler');
const billingCustomHandler = require('./billing-custom-handler');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); 

const port = process.env.PORT || 3009; 
const REDIRECT_URI = `http://localhost:${port}/api/zoho/callback`;

// --- REGISTER ACTIVE JOBS ---
const activeJobs = {};

inventoryHandler.setActiveJobs(activeJobs);
booksHandler.setActiveJobs(activeJobs); 
customModuleHandler.setActiveJobs(activeJobs);
expenseHandler.setActiveJobs(activeJobs);
booksCustomHandler.setActiveJobs(activeJobs);
billingHandler.setActiveJobs(activeJobs);
billingCustomHandler.setActiveJobs(activeJobs);

const authStates = {};

app.use(cors());
app.use(express.json({ limit: '50mb' })); // <--- INCREASED LIMIT FOR SAVE FILES

// --- ROUTES ---

app.post('/api/zoho/auth', (req, res) => {
    const { clientId, clientSecret, socketId } = req.body;
    if (!clientId || !clientSecret || !socketId) {
        return res.status(400).send('Client ID, Client Secret, and Socket ID are required.');
    }

    const state = crypto.randomBytes(16).toString('hex');
    authStates[state] = { clientId, clientSecret, socketId };

    setTimeout(() => delete authStates[state], 300000); 

    const combinedScopes = [
        'ZohoInventory.contacts.ALL',
        'ZohoInventory.invoices.ALL',
        'ZohoInventory.settings.ALL',
        'ZohoInventory.settings.READ',
        'ZohoInventory.settings.UPDATE',
        'ZohoInventory.custommodules.ALL', 
        'ZohoInventory.custommodules.CREATE',
        'ZohoInventory.custommodules.READ',
        'ZohoInventory.custommodules.UPDATE',
        'ZohoInventory.FullAccess.all', 
        'ZohoBooks.custommodules.ALL',  
        'ZohoBooks.custommodules.CREATE',
        'ZohoBooks.custommodules.READ',
        'ZohoBooks.custommodules.UPDATE',
        'ZohoBooks.fullaccess.all', 
        'ZohoExpense.fullaccess.all',
        'ZohoSubscriptions.customers.CREATE',
        'ZohoSubscriptions.customers.UPDATE',
        'ZohoSubscriptions.customers.READ',
        'ZohoSubscriptions.invoices.CREATE',
        'ZohoSubscriptions.invoices.UPDATE',
        'ZohoSubscriptions.invoices.READ',
        'ZohoSubscriptions.settings.READ',
        'ZohoSubscriptions.custommodules.CREATE',
        'ZohoSubscriptions.custommodules.READ',
        'ZohoSubscriptions.custommodules.UPDATE',
        'ZohoSubscriptions.custommodules.DELETE'
    ].join(',');
    
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${combinedScopes}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}&prompt=consent&state=${state}`;
    
    res.json({ authUrl });
});

app.get('/api/zoho/callback', async (req, res) => {
    const { code, state } = req.query;
    const authData = authStates[state];
    if (!authData) {
        return res.status(400).send('<h1>Error</h1><p>Invalid or expired session state.</p>');
    }
    delete authStates[state];

    try {
        const axios = require('axios');
        const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('client_id', authData.clientId);
        params.append('client_secret', authData.clientSecret);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('grant_type', 'authorization_code');
        
        const response = await axios.post(tokenUrl, params);
        const { refresh_token } = response.data;

        if (!refresh_token) {
            throw new Error('Refresh token not found in Zoho response.');
        }

        io.to(authData.socketId).emit('zoho-refresh-token', { refreshToken: refresh_token });
        res.send('<h1>Success!</h1><p>Token received. You can close this window.</p><script>window.close();</script>');

    } catch (error) {
        const { message } = parseError(error);
        io.to(authData.socketId).emit('zoho-refresh-token-error', { error: message });
        res.status(500).send(`<h1>Error</h1><p>${message}</p>`);
    }
});

app.post('/api/invoices/single', async (req, res) => {
    try {
        const result = await inventoryHandler.handleSendSingleInvoice(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// --- NEW: SAVE / LOAD ROUTES ---
app.post('/api/save-state', (req, res) => {
    try {
        const { filename, state } = req.body;
        if (!filename || !state) return res.status(400).json({ success: false, error: "Filename and state required" });
        const savedName = writeSaveFile(filename, state);
        res.json({ success: true, filename: savedName });
    } catch (error) {
        console.error("Save error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/list-saves', (req, res) => {
    try {
        const files = listSaveFiles();
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/load-state/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const state = readSaveFile(filename);
        res.json({ success: true, state });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// ------------------------------

app.get('/api/profiles', (req, res) => {
    res.json(readProfiles());
});

app.post('/api/profiles', (req, res) => {
    try {
        const newProfile = req.body;
        const profiles = readProfiles();
        if (profiles.some(p => p.profileName === newProfile.profileName)) {
            return res.status(400).json({ success: false, error: "Profile exists." });
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
        if (profileIndex === -1) return res.status(404).json({ success: false, error: "Not found." });
        
        profiles[profileIndex] = { ...profiles[profileIndex], ...updatedProfileData };
        writeProfiles(profiles);
        res.json({ success: true, profiles });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to update." });
    }
});

app.delete('/api/profiles/:profileNameToDelete', (req, res) => {
    try {
        const { profileNameToDelete } = req.params;
        const profiles = readProfiles();
        const newProfiles = profiles.filter(p => p.profileName !== profileNameToDelete);
        writeProfiles(newProfiles);
        res.json({ success: true, profiles: newProfiles });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to delete." });
    }
});

// --- SOCKET CONNECTION ---

io.on('connection', (socket) => {
    console.log(`[INFO] Socket connected: ${socket.id}`);

    // API Check
    socket.on('checkApiStatus', async (data) => {
        try {
            const { selectedProfileName, service: requestedService } = data; 
            const profiles = readProfiles();
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            
            if (!activeProfile) {
                return socket.emit('apiStatusResult', { success: false, message: "Profile not found." });
            }
            
            let service = requestedService || 'inventory';
            if (!requestedService) {
                if (activeProfile.books?.orgId) service = 'books';
                else if (activeProfile.expense?.orgId) service = 'expense';
                else if (activeProfile.billing?.orgId) service = 'billing';
            }

            const tokenResponse = await getValidAccessToken(activeProfile, service);
            
            let endpoint = '/organizations';
            if (service === 'inventory' || service === 'expense') endpoint = '/v1/organizations'; 
            
            const orgsResponse = await makeApiCall('get', endpoint, null, activeProfile, service);
            const targetOrgId = activeProfile[service]?.orgId;
            const currentOrg = orgsResponse.data.organizations.find(org => org.organization_id === targetOrgId);
            
            if (!currentOrg) throw new Error(`${service.toUpperCase()} Org ID invalid.`);

            let agentInfo = null;
            try {
                const userRes = await makeApiCall('get', '/users/me', null, activeProfile, service);
                if (userRes.data && userRes.data.user) {
                    const fullName = userRes.data.user.name || "Unknown Agent";
                    const nameParts = fullName.split(' ');
                    agentInfo = {
                        firstName: nameParts[0],
                        lastName: nameParts.slice(1).join(' ') || ''
                    };
                }
            } catch (userErr) {
                // Ignore user fetch errors
            }
            
            socket.emit('apiStatusResult', { 
                success: true, 
                message: `Connected to ${service.toUpperCase()}`,
                fullResponse: { ...tokenResponse, orgName: currentOrg.name, agentInfo }
            });
        } catch (error) {
            const { message } = parseError(error);
            socket.emit('apiStatusResult', { success: false, message: `Failed: ${message}` });
        }
    });

    // --- BOOKS HANDLERS ---
    const booksListeners = { 
        'startBulkBooksInvoice': booksHandler.handleStartBulkInvoice, 
        'startBulkBooksContact': booksHandler.handleStartBulkContact, 
        'getBooksOrgDetails': booksHandler.handleGetOrgDetails, 
        'updateBooksOrgDetails': booksHandler.handleUpdateOrgDetails, 
        'getBooksInvoices': booksHandler.handleGetInvoices, 
        'deleteBooksInvoices': booksHandler.handleDeleteInvoices 
    };
    for (const [event, handler] of Object.entries(booksListeners)) { 
        socket.on(event, (data) => { 
            const profiles = readProfiles(); 
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null; 
            if (activeProfile) handler(socket, { ...data, activeProfile }); 
        }); 
    }

    // --- INVENTORY HANDLERS ---
    const inventoryListeners = { 
        'startBulkInvoice': inventoryHandler.handleStartBulkInvoice, 
        'getOrgDetails': inventoryHandler.handleGetOrgDetails, 
        'updateOrgDetails': inventoryHandler.handleUpdateOrgDetails, 
        'getInvoices': inventoryHandler.handleGetInvoices, 
        'deleteInvoices': inventoryHandler.handleDeleteInvoices 
    };
    for (const [event, handler] of Object.entries(inventoryListeners)) { 
        socket.on(event, (data) => { 
            const profiles = readProfiles(); 
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null; 
            if (activeProfile) handler(socket, { ...data, activeProfile }); 
        }); 
    }

    // --- BILLING HANDLERS ---
    socket.on('startBulkBillingInvoice', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingHandler.handleStartBulkBillingInvoice(socket, { ...data, activeProfile });
    });
    socket.on('getBillingInvoices', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingHandler.handleGetInvoices(socket, { ...data, activeProfile });
    });
    socket.on('deleteBillingInvoices', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingHandler.handleDeleteInvoices(socket, { ...data, activeProfile });
    });
    socket.on('getBillingOrgDetails', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingHandler.handleGetOrgDetails(socket, { ...data, activeProfile });
    });
    socket.on('updateBillingOrgDetails', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingHandler.handleUpdateOrgDetails(socket, { ...data, activeProfile });
    });
    socket.on('startBulkBillingContact', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingHandler.handleStartBulkBillingContact(socket, { ...data, activeProfile });
    });

    // --- BILLING CUSTOM ---
    socket.on('fetchBillingModuleFields', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) {
            const moduleName = data.moduleApiName || activeProfile.billing?.customModuleApiName;
            billingCustomHandler.handleFetchBillingModuleFields(socket, { ...data, activeProfile, moduleApiName: moduleName });
        }
    });
    socket.on('startBulkBillingCustomJob', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) billingCustomHandler.handleStartBulkBillingCustomJob(socket, { ...data, activeProfile });
    });

    // --- CUSTOM MODULES ---
    socket.on('fetchBooksModuleFields', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if(activeProfile) booksCustomHandler.handleFetchModuleFields(socket, { ...data, activeProfile, moduleApiName: data.moduleApiName || activeProfile.books?.customModuleApiName });
    });
    socket.on('startBulkBooksCustomJob', (data) => {
        console.log(`[Socket] Event 'startBulkBooksCustomJob' received for profile: ${data.selectedProfileName}`);
        booksCustomHandler.handleStartBulkBooksCustomJob(socket, data);
    });

    socket.on('fetchModuleFields', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if(activeProfile) {
            const moduleName = data.moduleApiName || activeProfile.inventory?.customModuleApiName;
            customModuleHandler.handleFetchModuleFields(socket, { ...data, activeProfile, moduleApiName: moduleName });
        }
    });
    socket.on('startBulkCustomJob', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if(activeProfile) customModuleHandler.handleStartBulkCustomJob(socket, { ...data, activeProfile });
    });

    // --- EXPENSE ---
    socket.on('getExpenseFields', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) expenseHandler.handleGetExpenseFields(socket, { ...data, activeProfile });
    });
    socket.on('startBulkExpenseCreation', (data) => {
        const profiles = readProfiles();
        const activeProfile = profiles.find(p => p.profileName === data.selectedProfileName);
        if (activeProfile) expenseHandler.handleStartBulkExpenseCreation(socket, { ...data, activeProfile });
    });

    // --- JOB CONTROLS ---
    socket.on('pauseJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) {
            activeJobs[jobId].status = 'paused';
            socket.emit('jobPaused', { profileName, jobType, reason: 'Paused by user.' });
        }
    });

    socket.on('resumeJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) {
            activeJobs[jobId].status = 'running';
            socket.emit('jobResumed', { profileName, jobType });
        }
    });

    socket.on('endJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'ended';
    });

    socket.on('disconnect', () => {
        Object.keys(activeJobs).forEach(jobId => {
            if (jobId.startsWith(socket.id)) delete activeJobs[jobId];
        });
    });
});

server.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});