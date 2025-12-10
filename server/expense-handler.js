const { makeApiCall, parseError } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- UPDATED FUNCTION: Fetch Accounts with Detailed Logging ---
const handleGetExpenseAccounts = async (socket, { selectedProfileName }) => {
    console.log(`[ExpenseHandler] 🏁 Starting fetch for profile: ${selectedProfileName}`);

    try {
        const profiles = require('./utils').readProfiles();
        const profile = profiles.find(p => p.profileName === selectedProfileName);

        if (!profile) {
             socket.emit('expenseError', { message: `Profile '${selectedProfileName}' not found on server.` });
             return;
        }

        if (!profile.expense || !profile.expense.orgId) {
            socket.emit('expenseError', { message: `Profile '${selectedProfileName}' is missing Zoho Expense Org ID.` });
            return;
        }

        console.log(`[ExpenseHandler] 🔑 Using Org ID: ${profile.expense.orgId}`);
        
        // We attempt to fetch Paid Through Accounts
        const endpoint = '/v1/paid_through_accounts';
        console.log(`[ExpenseHandler] 📡 Calling Zoho API: GET ${endpoint}`);
        
        try {
            const response = await makeApiCall('GET', endpoint, null, profile, 'expense');
            
            console.log(`[ExpenseHandler] 📥 Zoho Status: ${response.status}`);
            
            if (!response.data || !response.data.paid_through_accounts) {
                 console.warn(`[ExpenseHandler] ⚠️ Unexpected response format:`, response.data);
                 // Fallback: Try to fetch Users just to see if connection works
                 socket.emit('expenseError', { 
                     message: "Connected to Zoho, but no 'paid_through_accounts' found. Do you have active bank/cash accounts?",
                     fullResponse: response.data 
                 });
                 return;
            }

            const rawAccounts = response.data.paid_through_accounts;
            console.log(`[ExpenseHandler] ✅ Found ${rawAccounts.length} accounts.`);

            const accounts = rawAccounts.map(acc => ({
                id: acc.account_id,
                name: acc.account_name,
                type: acc.account_type
            }));

            socket.emit('expenseAccountsFetched', accounts);

        } catch (apiError) {
            // This catches actual API failures (400, 401, 404)
            const errorDetails = apiError.response ? apiError.response.data : apiError.message;
            console.error("[ExpenseHandler] 💥 Zoho API Error:", JSON.stringify(errorDetails));
            
            socket.emit('expenseError', { 
                message: `Zoho API Error: ${apiError.response?.data?.message || apiError.message}`,
                fullResponse: errorDetails
            });
        }

    } catch (error) {
        console.error("General Error fetching accounts:", error.message);
        socket.emit('expenseError', { message: `Server Error: ${error.message}` });
    }
};

const handleTestCustomModule = async (socket, data) => {
    const { activeProfile } = data;
    
    // 1. Validation
    if (!activeProfile || !activeProfile.expense || !activeProfile.expense.orgId) {
        socket.emit('expenseTestResult', { 
            success: false, 
            message: 'Zoho Expense Org ID is missing in the selected profile.' 
        });
        return;
    }

    const orgId = activeProfile.expense.orgId;
    const moduleName = activeProfile.expense.testModuleName || 'cm_testmodule';

    try {
        // --- STEP 1: CREATE RECORD ---
        socket.emit('expenseTestUpdate', { message: `🚀 Creating test record in module: ${moduleName}...` });
        
        const testData = {
            "Name": `Test - ${new Date().toISOString()}`,
            "Date": new Date().toISOString().split('T')[0] 
        };

        const createUrl = `/v1/${moduleName}`;
        const createResponse = await makeApiCall('post', createUrl, testData, activeProfile, 'expense');
        
        let recordId = null;
        const resData = createResponse.data;
        
        const keys = Object.keys(resData);
        keys.forEach(k => {
            if (resData[k] && resData[k].module_record_id) recordId = resData[k].module_record_id;
            else if (resData[k] && resData[k].custom_module_id) recordId = resData[k].custom_module_id;
            else if (resData[k] && resData[k].id) recordId = resData[k].id;
        });

        if (!recordId) {
             socket.emit('expenseTestResult', { 
                success: false, 
                message: 'Record created but could not parse Record ID.',
                fullResponse: resData
            });
            return;
        }

        socket.emit('expenseTestUpdate', { 
            message: `✅ Record Created (ID: ${recordId}).\n⏳ Waiting 10 seconds for backend scripts...` 
        });

        // --- STEP 2: WAIT ---
        await sleep(10000);

        // --- STEP 3: INSPECT RECORD ---
        socket.emit('expenseTestUpdate', { message: `🔍 Fetching record to verify logs...` });

        const getUrl = `/v1/${moduleName}/${recordId}`;
        const getResponse = await makeApiCall('get', getUrl, null, activeProfile, 'expense');
        const body = getResponse.data;

        let recordData = null;
        Object.keys(body).forEach(k => {
            if (typeof body[k] === 'object' && body[k].module_fields) {
                recordData = body[k];
            }
        });

        if (!recordData) {
            socket.emit('expenseTestResult', { 
                success: false, 
                message: 'Could not find "module_fields" in the fetch response.',
                fullResponse: body
            });
            return;
        }

        const fields = recordData.module_fields || [];
        const logField = fields.find(f => f.api_name === "cf_api_log");
        const logValue = logField ? logField.value : null;

        if (logValue && logValue.includes("API LOG")) {
             socket.emit('expenseTestResult', { 
                success: true, 
                message: `🎉 SUCCESS! Log Verified.\nValue: "${logValue}"`,
                fullResponse: body
            });
        } else {
             socket.emit('expenseTestResult', { 
                success: false, 
                message: `⚠️ Log Missing or Incorrect.\nExpected "API LOG", found: "${logValue || 'null'}"`,
                fullResponse: body
            });
        }

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('expenseTestResult', { 
            success: false, 
            message: `Error: ${message}`,
            fullResponse: fullResponse
        });
    }
};

module.exports = {
    setActiveJobs,
    handleTestCustomModule,
    handleGetExpenseAccounts
};