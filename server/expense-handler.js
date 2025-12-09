// server/expense-handler.js
const axios = require('axios');
const { getValidAccessToken, createJobId } = require('./utils');

const EXPENSE_API_BASE = 'https://www.zohoapis.com/expense/v1';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- 1. Fetch Fields ---
const handleGetFields = async (socket, data) => {
    const { profileName, module } = data;
    try {
        const { activeProfile } = data;
        const accessToken = await getValidAccessToken(activeProfile, 'expense');
        const orgId = activeProfile.expense?.orgId;

        if (!orgId) {
            throw new Error('Expense Organization ID is missing in profile settings.');
        }
        
        // Exact logic from server.js API 1
        const url = `${EXPENSE_API_BASE}/settings/fields?entity=${module}`;
        const response = await axios.get(url, {
            headers: { 
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'X-com-zoho-expense-organizationid': orgId
            }
        });

        // Exact parsing from server.js
        const fields = response.data.fields || response.data.data || [];
        
        socket.emit('expenseFieldsLoaded', { success: true, fields });
    } catch (error) {
        console.error('Error fetching expense fields:', error.message);
        // Handle 401 specifically to give a better error message
        if (error.response && error.response.status === 401) {
            socket.emit('expenseFieldsLoaded', { 
                success: false, 
                error: "401 Unauthorized. Please restart your server, then Edit Profile > Generate Token again." 
            });
        } else {
            socket.emit('expenseFieldsLoaded', { success: false, error: error.message });
        }
    }
};

// --- 2. Bulk Process (Create & Check Log) ---
const handleStartBulkExpense = async (socket, data) => {
    const { 
        activeProfile, 
        moduleName, 
        bulkField,       
        bulkValues,      
        defaultData,     
        delay = 1 
    } = data;

    const valuesArray = bulkValues.split('\n').filter(v => v.trim());
    const totalToProcess = valuesArray.length;
    
    // We assume the delay from the form is the "Wait time to check log" (e.g. 10s)
    const waitTime = (delay * 1000) || 10000; 

    // Emit initial status
    socket.emit('expenseResult', {
        profileName: activeProfile.profileName,
        rowNumber: 0,
        primaryValue: 'START',
        success: true,
        message: 'Job Started'
    });

    for (let i = 0; i < totalToProcess; i++) {
        const primaryVal = valuesArray[i].trim();
        
        try {
            const accessToken = await getValidAccessToken(activeProfile, 'expense');
            const orgId = activeProfile.expense?.orgId;
            
            const headers = { 
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'X-com-zoho-expense-organizationid': orgId
            };

            // 1. Construct Payload
            const payload = {
                ...defaultData,
                [bulkField]: primaryVal
            };

            // 2. CREATE RECORD
            const url = `${EXPENSE_API_BASE}/${moduleName}`;
            const response = await axios.post(url, payload, { headers });
            const resData = response.data;

            // 3. PARSE ID (Logic from server.js)
            let recordId = null;
            const keys = Object.keys(resData);
            keys.forEach(k => {
                if (resData[k] && resData[k].module_record_id) recordId = resData[k].module_record_id;
                else if (resData[k] && resData[k].custom_module_id) recordId = resData[k].custom_module_id;
                else if (resData[k] && resData[k].id) recordId = resData[k].id;
            });

            if (!recordId) {
                throw new Error("Created, but could not parse Record ID from response.");
            }

            // Emit "Created" status (Yellow/Pending)
            socket.emit('expenseResult', {
                profileName: activeProfile.profileName,
                rowNumber: i + 1,
                primaryValue: primaryVal,
                success: true,
                message: 'Created. Waiting for log...',
                details: `ID: ${recordId}. Checking in ${delay}s...`,
                recordId: recordId
            });

            // 4. WAIT (Sleep)
            await sleep(waitTime);

            // 5. INSPECT (Fetch & Check Log)
            try {
                const detailUrl = `${EXPENSE_API_BASE}/${moduleName}/${recordId}`;
                const detailRes = await axios.get(detailUrl, { headers });
                const body = detailRes.data;

                // LOGIC FROM SERVER.JS
                let recordData = null;
                Object.keys(body).forEach(k => {
                    if (typeof body[k] === 'object' && body[k].module_fields) {
                        recordData = body[k];
                    }
                });

                if (!recordData) {
                    throw new Error("Could not find module_fields in verification response");
                }

                const fields = recordData.module_fields || [];
                const logField = fields.find(f => f.api_name === "cf_api_log");
                const logValue = logField ? logField.value : null;

                if (logValue && logValue.includes("API LOG")) {
                    // SUCCESS: Log Found!
                    socket.emit('expenseResult', {
                        profileName: activeProfile.profileName,
                        rowNumber: i + 1,
                        primaryValue: primaryVal,
                        success: true,
                        message: 'Success (Log Verified)',
                        details: logValue,
                        recordId: recordId,
                        fullResponse: body
                    });
                } else {
                    // WARNING: Log Missing
                    socket.emit('expenseResult', {
                        profileName: activeProfile.profileName,
                        rowNumber: i + 1,
                        primaryValue: primaryVal,
                        success: false, // Mark as red if log missing
                        message: 'Log Missing',
                        details: `Field value: ${logValue || 'Empty'}`,
                        recordId: recordId,
                        fullResponse: body
                    });
                }

            } catch (inspectError) {
                socket.emit('expenseResult', {
                    profileName: activeProfile.profileName,
                    rowNumber: i + 1,
                    primaryValue: primaryVal,
                    success: false,
                    message: 'Verification Failed',
                    details: inspectError.message,
                    recordId: recordId
                });
            }

        } catch (error) {
            const errorMsg = error.response?.data?.message || error.message;
            socket.emit('expenseResult', {
                profileName: activeProfile.profileName,
                rowNumber: i + 1,
                primaryValue: primaryVal,
                success: false,
                message: 'Creation Failed',
                details: errorMsg,
                fullResponse: error.response?.data
            });
        }
    }

    socket.emit('bulkComplete', { 
        profileName: activeProfile.profileName, 
        jobType: 'expense' 
    });
};

module.exports = {
    handleGetFields,
    handleStartBulkExpense,
    setActiveJobs: (jobs) => { }
};