// --- FILE: server/utils.js ---

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data'); 

const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const TICKET_LOG_PATH = path.join(__dirname, 'ticket-log.json');
const tokenCache = {};

const readProfiles = () => {
    try {
        if (fs.existsSync(PROFILES_PATH)) {
            const data = fs.readFileSync(PROFILES_PATH);
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[ERROR] Could not read profiles.json:', error);
    }
    return [];
};

const writeProfiles = (profiles) => {
    try {
        fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2));
    } catch (error) {
        console.error('[ERROR] Could not write to profiles.json:', error);
    }
};

const readTicketLog = () => {
    try {
        if (fs.existsSync(TICKET_LOG_PATH)) {
            const data = fs.readFileSync(TICKET_LOG_PATH);
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[ERROR] Could not read ticket-log.json:', error);
    }
    return [];
};

const writeToTicketLog = (newEntry) => {
    const log = readTicketLog();
    log.push(newEntry);
    try {
        fs.writeFileSync(TICKET_LOG_PATH, JSON.stringify(log, null, 2));
    } catch (error) {
        console.error('[ERROR] Could not write to ticket-log.json:', error);
    }
};

const createJobId = (socketId, profileName, jobType) => `${socketId}_${profileName}_${jobType}`;

const parseError = (error) => {
    console.error("\n--- 🛑 ZOHO API ERROR LOG 🛑 ---");
    if (error.response) {
        console.error(`Status: ${error.response.status} ${error.response.statusText}`);
        console.error("URL:", error.config?.url);
        console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else {
        console.error("Error Message:", error.message);
    }
    console.error("------------------------------\n");

    if (error.response) {
        if (error.response.data?.message) return { message: error.response.data.message, fullResponse: error.response.data };
        if (error.response.data?.code) return { message: `Code ${error.response.data.code}: ${error.response.data.message || 'Unknown Error'}`, fullResponse: error.response.data };
        return { message: `HTTP ${error.response.status}: ${error.response.statusText}`, fullResponse: error.response.data };
    }
    return { message: error.message || 'Network/Unknown Error', fullResponse: error.stack };
};

const getValidAccessToken = async (profile, service) => {
    const now = Date.now();
    const cacheKey = `${profile.profileName}_${service}`;

    if (tokenCache[cacheKey] && tokenCache[cacheKey].data.access_token && tokenCache[cacheKey].expiresAt > now) {
        return tokenCache[cacheKey].data;
    }
    
    const scopes = {
        desk: 'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ',
        catalyst: 'ZohoCatalyst.projects.users.CREATE,ZohoCatalyst.projects.users.READ,ZohoCatalyst.projects.users.DELETE,ZohoCatalyst.email.CREATE',
        qntrl: 'Qntrl.job.ALL,Qntrl.user.READ,Qntrl.layout.ALL',
        people: 'ZOHOPEOPLE.organization.READ,ZOHOPEOPLE.employee.ALL,ZOHOPEOPLE.forms.ALL',
        creator: 'ZohoCreator.form.CREATE,ZohoCreator.report.CREATE,ZohoCreator.report.READ,ZohoCreator.report.UPDATE,ZohoCreator.report.DELETE,ZohoCreator.meta.form.READ,ZohoCreator.meta.application.READ,ZohoCreator.dashboard.READ',
        projects: [
            'ZohoProjects.portals.ALL',
            'ZohoProjects.projects.ALL',
            'ZohoProjects.tasklists.ALL',
            'ZohoProjects.tasks.ALL',
        ].join(','),
        meeting: 'ZohoMeeting.manageOrg.READ,ZohoMeeting.webinar.READ,ZohoMeeting.webinar.DELETE,ZohoMeeting.webinar.UPDATE,ZohoMeeting.webinar.CREATE,ZohoMeeting.user.READ',
        fsm: 'ZohoFSM.modules.Contacts.UPDATE,ZohoFSM.modules.Contacts.CREATE,ZohoFSM.modules.Contacts.READ,ZohoFSM.modules.custom.READ,ZohoFSM.modules.custom.ALL,ZohoFSM.modules.custom.CREATE',
        // --- ADDED BOOKINGS SCOPE ---
        bookings: 'zohobookings.data.CREATE'
    };
    
    const requiredScope = scopes[service];
    if (!requiredScope) {
        throw new Error(`Invalid service specified: ${service}`);
    }

    try {
        const params = new URLSearchParams({
            refresh_token: profile.refreshToken,
            client_id: profile.clientId,
            client_secret: profile.clientSecret,
            grant_type: 'refresh_token',
            scope: requiredScope
        });

        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        
        const { expires_in } = response.data;
        tokenCache[cacheKey] = { 
            data: response.data, 
            expiresAt: now + ((expires_in - 60) * 1000) 
        };
        
        return response.data;

    } catch (error) {
        const { message } = parseError(error);
        console.error(`TOKEN_REFRESH_FAILED for ${profile.profileName} (${service}):`, message);
        throw error;
    }
};

const makeApiCall = async (method, relativeUrl, data, profile, service, queryParams = {}) => {
    const tokenResponse = await getValidAccessToken(profile, service);
    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
        throw new Error('Failed to retrieve a valid access token.');
    }

    const serviceConfig = profile[service];
    if (!serviceConfig && service !== 'qntrl' && service !== 'people' && service !== 'meeting' && service !== 'fsm' && service !== 'bookings') {
         throw new Error(`Configuration for service "${service}" is missing in profile "${profile.profileName}".`);
    }

    let fullUrl;
    
    if (service === 'creator') {
        if (!serviceConfig.baseUrl) {
            throw new Error(`Creator config (baseUrl) is missing for profile "${profile.profileName}".`);
        }
        fullUrl = `https://${serviceConfig.baseUrl}/creator/v2.1${relativeUrl}`;
    } 
    else {
        const baseUrls = {
            desk: 'https://desk.zoho.com', 
            catalyst: 'https://api.catalyst.zoho.com',
            qntrl: 'https://coreapi.qntrl.com',
            people: 'https://people.zoho.com',
            projects: 'https://projectsapi.zoho.com/api/v3',
            meeting: 'https://meeting.zoho.com',
            fsm: 'https://fsm.zoho.com/fsm/v1',
            // --- ADDED BOOKINGS URL ---
            bookings: 'https://www.zohoapis.com/bookings/v1/json'
        };
        
        const baseUrl = baseUrls[service];
        if (!baseUrl) {
             throw new Error(`No base URL defined for service "${service}".`);
        }
        fullUrl = `${baseUrl}${relativeUrl}`;
    }
    
    const headers = { 
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
    };
    
    if (service === 'desk' && profile.desk?.orgId) {
        headers['orgId'] = profile.desk.orgId;
    }
    
    const params = { ...queryParams }; 

    if (service === 'fsm' && profile.fsm?.orgId) {
        headers['X-FSM-ORG-ID'] = profile.fsm.orgId; 
    }
    
    let requestData = data;
    if ( (service === 'creator' || service === 'meeting' || service === 'fsm') && (method.toLowerCase() === 'post' || method.toLowerCase() === 'patch' || method.toLowerCase() === 'put')) {
        headers['Content-Type'] = 'application/json';
        requestData = data; 
    }

    // --- ADDED BOOKINGS CONTENT-TYPE ---
    if (service === 'bookings') {
        // Bookings often expects params in the URL for GET, or form-urlencoded for POST
        if (method.toLowerCase() === 'post') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
    }
    
    const axiosConfig = {
        method,
        url: fullUrl,
        data: requestData,
        headers,
        params
    };
    
    if (data instanceof FormData) {
        headers['Content-Type'] = `multipart/form-data; boundary=${data.getBoundary()}`;
    }

    if (service === 'catalyst' && method.toLowerCase() === 'get') {
        axiosConfig.transformResponse = [responseData => responseData];
    }
    
    console.log("\n--- ZOHO API CALL ---");
    console.log(`[${new Date().toISOString()}]`);
    console.log(`Profile: ${profile.profileName}, Service: ${service}`);
    console.log(`Request: ${method.toUpperCase()} ${fullUrl}`);
    console.log("Headers:", JSON.stringify(headers, (key, value) => key === 'Authorization' ? '[REDACTED]' : value, 2));
    console.log("---------------------\n");
    
    return axios(axiosConfig);
};

module.exports = {
    readProfiles,
    writeProfiles,
    readTicketLog,
    writeToTicketLog,
    createJobId,
    parseError,
    getValidAccessToken,
    makeApiCall
};