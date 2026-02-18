const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const util = require('util');

// --- 🔴 CONFIGURATION ---
const WORKER_URL = "https://zoho-ops-logger.arfilm47.workers.dev"; 

const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const TICKET_LOG_PATH = path.join(__dirname, 'ticket-log.json');
const tokenCache = {};

// --- Core Helpers (Keep as is) ---
const readProfiles = () => { try { if (fs.existsSync(PROFILES_PATH)) return JSON.parse(fs.readFileSync(PROFILES_PATH)); } catch (e) {} return []; };
const writeProfiles = (p) => { try { fs.writeFileSync(PROFILES_PATH, JSON.stringify(p, null, 2)); } catch (e) {} };
const readTicketLog = () => { try { if (fs.existsSync(TICKET_LOG_PATH)) return JSON.parse(fs.readFileSync(TICKET_LOG_PATH)); } catch (e) {} return []; };
const writeToTicketLog = (entry) => { const log = readTicketLog(); log.push(entry); try { fs.writeFileSync(TICKET_LOG_PATH, JSON.stringify(log, null, 2)); } catch (e) {} };
const createJobId = (socketId, profileName, jobType) => `${socketId}_${profileName}_${jobType}`;

const parseError = (error) => {
    if (error.response) return { message: `HTTP ${error.response.status}`, fullResponse: error.response.data };
    return { message: error.message || 'Unknown Error', fullResponse: error.stack };
};

const getValidAccessToken = async (profile, service) => {
    const now = Date.now();
    const cacheKey = `${profile.profileName}_${service}`;
    if (tokenCache[cacheKey] && tokenCache[cacheKey].data.access_token && tokenCache[cacheKey].expiresAt > now) return tokenCache[cacheKey].data;
    
    const scopes = { desk: 'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ', catalyst: 'ZohoCatalyst.projects.users.CREATE,ZohoCatalyst.projects.users.READ,ZohoCatalyst.projects.users.DELETE,ZohoCatalyst.email.CREATE', qntrl: 'Qntrl.job.ALL,Qntrl.user.READ,Qntrl.layout.ALL', people: 'ZOHOPEOPLE.organization.READ,ZOHOPEOPLE.employee.ALL,ZOHOPEOPLE.forms.ALL', creator: 'ZohoCreator.form.CREATE,ZohoCreator.report.CREATE,ZohoCreator.report.READ,ZohoCreator.report.UPDATE,ZohoCreator.report.DELETE,ZohoCreator.meta.form.READ,ZohoCreator.meta.application.READ,ZohoCreator.dashboard.READ', projects: 'ZohoProjects.portals.ALL,ZohoProjects.projects.ALL,ZohoProjects.tasklists.ALL,ZohoProjects.tasks.ALL', meeting: 'ZohoMeeting.manageOrg.READ,ZohoMeeting.webinar.READ,ZohoMeeting.webinar.DELETE,ZohoMeeting.webinar.UPDATE,ZohoMeeting.webinar.CREATE,ZohoMeeting.user.READ', fsm: 'ZohoFSM.modules.Contacts.UPDATE,ZohoFSM.modules.Contacts.CREATE,ZohoFSM.modules.Contacts.READ,ZohoFSM.modules.custom.READ,ZohoFSM.modules.custom.ALL,ZohoFSM.modules.custom.CREATE', bookings: 'zohobookings.data.CREATE' };
    
    const params = new URLSearchParams({ refresh_token: profile.refreshToken, client_id: profile.clientId, client_secret: profile.clientSecret, grant_type: 'refresh_token', scope: scopes[service] });
    const res = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
    tokenCache[cacheKey] = { data: res.data, expiresAt: now + ((res.data.expires_in - 60) * 1000) };
    return res.data;
};

// --- 🕵️ TYPE HELPERS ---
const isFormData = (d) => d && typeof d.getBoundary === 'function';
const isURLSearchParams = (d) => d && typeof d.append === 'function' && typeof d.delete === 'function';

// --- 🧠 SMART LOGGING HELPER ---
function extractDetails(service, data) {
    if (!data) return "No Data";
    let clean = isURLSearchParams(data) ? Object.fromEntries(data) : (data.data || data);
    const item = Array.isArray(clean) ? clean[0] : clean;

    const getVal = (obj, key) => {
        if (!obj || typeof obj !== 'object') return null;
        const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase() || k.toLowerCase() === key.replace('_','').toLowerCase());
        return foundKey ? obj[foundKey] : null;
    };

    if (service === 'qntrl') return `📇 Qntrl Job: ${getVal(item, 'title') || "Unknown"}`;
    if (service === 'fsm') return `👤 Contact: ${getVal(item, 'last_name') || "Unknown"}`;
    return "Action Logged";
}

// --- UPDATED makeApiCall ---
const makeApiCall = async (method, relativeUrl, data, profile, service, queryParams = {}) => {
    const tokenResponse = await getValidAccessToken(profile, service);
    const accessToken = tokenResponse.access_token;
    
    const baseUrls = { desk: 'https://desk.zoho.com', catalyst: 'https://api.catalyst.zoho.com', qntrl: 'https://coreapi.qntrl.com', people: 'https://people.zoho.com', projects: 'https://projectsapi.zoho.com/api/v3', meeting: 'https://meeting.zoho.com', fsm: 'https://fsm.zoho.com/fsm/v1', bookings: 'https://www.zohoapis.com/bookings/v1/json' };
    let fullUrl = service === 'creator' ? `https://${profile.creator.baseUrl}/creator/v2.1${relativeUrl}` : `${baseUrls[service]}${relativeUrl}`;

    const headers = { 'Authorization': `Zoho-oauthtoken ${accessToken}` };
    if (service === 'desk' && profile.desk?.orgId) headers['orgId'] = profile.desk.orgId;
    if (service === 'fsm' && profile.fsm?.orgId) headers['X-FSM-ORG-ID'] = profile.fsm.orgId;

    let requestData = data;
    
    // 🚨 QNTRL FIX: Detect URLSearchParams and convert to JSON object
    if (isURLSearchParams(requestData)) {
        if (service === 'qntrl') {
            requestData = Object.fromEntries(requestData); // Convert to JSON for Qntrl
            headers['Content-Type'] = 'application/json';
        } else {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
    } 
    else if (isFormData(requestData)) {
        headers['Content-Type'] = `multipart/form-data; boundary=${requestData.getBoundary()}`;
    } 
    else if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
        headers['Content-Type'] = 'application/json';
    }

    const axiosConfig = { method, url: fullUrl, data: requestData, headers, params: queryParams };

    try {
        const response = await axios(axiosConfig);
        
        // Log to Worker
        if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase())) {
            // We use a clean object for the Worker log so it's readable
            const workerBody = isURLSearchParams(data) ? Object.fromEntries(data) : (isFormData(data) ? "FormData" : data);
            axios.post(WORKER_URL, {
                source: `zoho-${service}`,
                method: method.toUpperCase(),
                path: fullUrl,
                status: response.status,
                body: workerBody,
                summary: extractDetails(service, data)
            }).catch(() => {});
        }
        return response;
    } catch (error) {
        axios.post(WORKER_URL, {
            source: `zoho-${service}-error`,
            method: method.toUpperCase(),
            path: fullUrl,
            status: error.response ? error.response.status : 500,
            summary: "❌ API Error"
        }).catch(() => {});
        throw error;
    }
};

module.exports = { readProfiles, writeProfiles, readTicketLog, writeToTicketLog, createJobId, parseError, getValidAccessToken, makeApiCall };