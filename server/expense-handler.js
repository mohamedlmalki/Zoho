const { makeApiCall, parseError } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
        
        // Use a generic test payload. 
        // We use "Name" and "Date" as they are common fields.
        const testData = {
            "Name": `Test - ${new Date().toISOString()}`,
            "Date": new Date().toISOString().split('T')[0] 
        };

        const createUrl = `/v1/${moduleName}`;
        // Note: 'expense' service type is used for authentication
        const createResponse = await makeApiCall('post', createUrl, testData, activeProfile, 'expense');
        
        // Parse ID from response (Handles various ID formats)
        let recordId = null;
        const resData = createResponse.data;
        
        // Try to find the record ID in the response object
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

        // Find the record data (it's usually wrapped in an object key like "cm_testmodule": {...})
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

        // Look for 'cf_api_log'
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
    handleTestCustomModule
};