// --- FILE: apps/ops/server/utils.js ---

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); 

// --- 🔴 CONFIGURATION ---
const WORKER_URL = "https://zoho-ops-logger.arfilm47.workers.dev"; 

const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const TICKET_LOG_PATH = path.join(__dirname, 'ticket-log.json');
const tokenCache = {};

// --- Helper Functions ---
const readProfiles = () => { try { if (fs.existsSync(PROFILES_PATH)) { return JSON.parse(fs.readFileSync(PROFILES_PATH)); } } catch (e) { console.error(e); } return []; };
const writeProfiles = (profiles) => { try { fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2)); } catch (e) { console.error(e); } };
const readTicketLog = () => { try { if (fs.existsSync(TICKET_LOG_PATH)) { return JSON.parse(fs.readFileSync(TICKET_LOG_PATH)); } } catch (e) { console.error(e); } return []; };
const writeToTicketLog = (newEntry) => { const log = readTicketLog(); log.push(newEntry); try { fs.writeFileSync(TICKET_LOG_PATH, JSON.stringify(log, null, 2)); } catch (e) { console.error(e); } };
const createJobId = (socketId, profileName, jobType) => `${socketId}_${profileName}_${jobType}`;

const parseError = (error) => {
    console.error("\n--- 🛑 ZOHO API ERROR LOG 🛑 ---");
    if (error.response) {
        console.error(`Status: ${error.response.status} ${error.response.statusText}`);
        console.error("URL:", error.config?.url);
    } else { console.error("Error Message:", error.message); }
    console.error("------------------------------\n");
    if (error.response) return { message: `HTTP ${error.response.status}`, fullResponse: error.response.data };
    return { message: error.message || 'Unknown Error', fullResponse: error.stack };
};

const getValidAccessToken = async (profile, service) => {
    const now = Date.now();
    const cacheKey = `${profile.profileName}_${service}`;
    if (tokenCache[cacheKey] && tokenCache[cacheKey].data.access_token && tokenCache[cacheKey].expiresAt > now) return tokenCache[cacheKey].data;

    const scopes = {
        desk: 'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ',
        catalyst: 'ZohoCatalyst.projects.users.CREATE,ZohoCatalyst.projects.users.READ,ZohoCatalyst.projects.users.DELETE,ZohoCatalyst.email.CREATE',
        qntrl: 'Qntrl.job.ALL,Qntrl.user.READ,Qntrl.layout.ALL',
        people: 'ZOHOPEOPLE.organization.READ,ZOHOPEOPLE.employee.ALL,ZOHOPEOPLE.forms.ALL',
        creator: 'ZohoCreator.form.CREATE,ZohoCreator.report.CREATE,ZohoCreator.report.READ,ZohoCreator.report.UPDATE,ZohoCreator.report.DELETE,ZohoCreator.meta.form.READ,ZohoCreator.meta.application.READ,ZohoCreator.dashboard.READ',
        projects: 'ZohoProjects.portals.ALL,ZohoProjects.projects.ALL,ZohoProjects.tasklists.ALL,ZohoProjects.tasks.ALL',
        meeting: 'ZohoMeeting.manageOrg.READ,ZohoMeeting.webinar.READ,ZohoMeeting.webinar.DELETE,ZohoMeeting.webinar.UPDATE,ZohoMeeting.webinar.CREATE,ZohoMeeting.user.READ',
        fsm: 'ZohoFSM.modules.Contacts.UPDATE,ZohoFSM.modules.Contacts.CREATE,ZohoFSM.modules.Contacts.READ,ZohoFSM.modules.custom.READ,ZohoFSM.modules.custom.ALL,ZohoFSM.modules.custom.CREATE',
        bookings: 'zohobookings.data.CREATE'
    };

    const requiredScope = scopes[service];
    if (!requiredScope) throw new Error(`Invalid service: ${service}`);

    try {
        const params = new URLSearchParams({
            refresh_token: profile.refreshToken,
            client_id: profile.clientId,
            client_secret: profile.clientSecret,
            grant_type: 'refresh_token',
            scope: requiredScope
        });
        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        if (response.data.error) throw new Error(response.data.error);
        
        tokenCache[cacheKey] = { data: response.data, expiresAt: now + ((response.data.expires_in - 60) * 1000) };
        return response.data;
    } catch (error) {
        console.error(`TOKEN ERROR: ${error.message}`);
        throw error;
    }
};

// --- 🧠 SMART LOGGING HELPER ---
function extractDetails(service, data) {
    if (!data) return "No Data Payload";
    if (data instanceof FormData) return "📦 FormData Payload (File Upload)";
    
    let cleanData = data.data || data;
    if (Array.isArray(cleanData)) {
        if (cleanData.length === 0) return "Empty Data Array";
        cleanData = cleanData[0]; 
    }

    const get = (obj, key) => {
        if (!obj || typeof obj !== 'object') return null;
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
        return foundKey ? obj[foundKey] : null;
    };

    if (service === 'qntrl') {
        const title = get(cleanData, 'title') || get(cleanData, 'job_name') || get(cleanData, 'card_name') || "Unknown Job";
        return `📇 Qntrl Job: ${title}`;
    }
    if (service === 'fsm') {
        const name = get(cleanData, 'last_name') || get(cleanData, 'lastname') || get(cleanData, 'contactName') || get(cleanData, 'name') || "Unknown Name";
        const email = get(cleanData, 'email') || get(cleanData, 'secondaryEmail') || "No Email";
        return `👤 Contact: ${name} | 📧 ${email}`;
    }
    if (service === 'desk') {
        const subject = get(cleanData, 'subject') || "No Subject";
        const email = get(cleanData, 'email') || (cleanData.contact ? get(cleanData.contact, 'email') : "No Email");
        return `🎫 Ticket: ${subject} | 📧 ${email}`;
    }
    if (service === 'projects') {
        const taskName = get(cleanData, 'name') || get(cleanData, 'task_name');
        return `✅ Task: ${taskName || "Unknown Task"}`;
    }
    if (service === 'people') {
        const fName = get(cleanData, 'firstName') || "Unknown";
        return `👥 Employee: ${fName}`;
    }
    if (service === 'bookings') {
        return `📅 Booking: ${get(cleanData, 'customer_name')} | 📧 ${get(cleanData, 'customer_email')}`;
    }
    return `Payload Keys: ${Object.keys(cleanData).join(', ')}`;
}

// --- RESTORED & DEBUGGED makeApiCall ---
const makeApiCall = async (method, relativeUrl, data, profile, service, queryParams = {}) => {
    const tokenResponse = await getValidAccessToken(profile, service);
    const accessToken = tokenResponse.access_token;
    
    // 1. Build URL
    const serviceConfig = profile[service];
    const baseUrls = {
        desk: 'https://desk.zoho.com', catalyst: 'https://api.catalyst.zoho.com', qntrl: 'https://coreapi.qntrl.com',
        people: 'https://people.zoho.com', projects: 'https://projectsapi.zoho.com/api/v3', meeting: 'https://meeting.zoho.com',
        fsm: 'https://fsm.zoho.com/fsm/v1', bookings: 'https://www.zohoapis.com/bookings/v1/json'
    };
    
    let fullUrl;
    if (service === 'creator') fullUrl = `https://${serviceConfig.baseUrl}/creator/v2.1${relativeUrl}`;
    else fullUrl = `${baseUrls[service]}${relativeUrl}`;

    // 2. Prepare Headers
    const headers = { 'Authorization': `Zoho-oauthtoken ${accessToken}` };
    if (service === 'desk' && profile.desk?.orgId) headers['orgId'] = profile.desk.orgId;
    if (service === 'fsm' && profile.fsm?.orgId) headers['X-FSM-ORG-ID'] = profile.fsm.orgId;
    
    // 3. Prepare Data (RESTORED ORIGINAL LOGIC)
    let requestData = data;
    
    // Only force JSON for specific services where we KNOW it is required
    // I REMOVED 'qntrl' from this list to restore previous behavior
    if ((['creator','meeting','fsm'].includes(service)) && ['post','put','patch'].includes(method.toLowerCase())) {
        headers['Content-Type'] = 'application/json';
    }
    
    if (service === 'bookings' && method.toLowerCase() === 'post') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    
    if (data instanceof FormData) {
        headers['Content-Type'] = 'multipart/form-data'; 
    }

    const axiosConfig = { method, url: fullUrl, data: requestData, headers, params: queryParams };

    // --- 🔴 DEBUG LOGS (Shows in your Terminal) ---
    console.log(`\n>>> 🚀 SENDING [${service.toUpperCase()}] REQUEST >>>`);
    console.log(`URL: ${method.toUpperCase()} ${fullUrl}`);
    console.log("HEADERS:", JSON.stringify(headers, (k,v) => k=='Authorization' ? '***' : v, 2));
    if (!(data instanceof FormData)) {
        console.log("BODY:", JSON.stringify(data, null, 2));
    } else {
        console.log("BODY: [FormData Object]");
    }
    console.log("------------------------------------------\n");
    // ---------------------------------------------

    // Worker Logic
    const isWriteAction = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    
    try {
        const response = await axios(axiosConfig);

        if (isWriteAction) {
            const summary = extractDetails(service, data);
            const logBody = (data instanceof FormData) ? { info: "FormData Object (Hidden)" } : data;
            const logEntry = {
                source: `zoho-${service}`,
                method: method.toUpperCase(),
                path: fullUrl,
                status: response.status,
                body: logBody, 
                summary: summary 
            };
            axios.post(WORKER_URL, logEntry).catch(() => {});
        }
        return response;

    } catch (error) {
        // Log Error to Worker
        const errorLog = {
            source: `zoho-${service}-error`,
            method: method.toUpperCase(),
            path: fullUrl,
            status: error.response ? error.response.status : 500,
            error: error.message,
            body: (data instanceof FormData) ? "FormData" : data,
            summary: "❌ Failed Request"
        };
        axios.post(WORKER_URL, errorLog).catch(() => {});
        throw error;
    }
};

module.exports = {
    readProfiles, writeProfiles, readTicketLog, writeToTicketLog,
    createJobId, parseError, getValidAccessToken, makeApiCall
};