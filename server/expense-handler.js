const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

// Helper for the 10s delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const handleGetExpenseFields = async (socket, data) => {
    try {
        const { activeProfile, moduleName } = data;
        
        if (!activeProfile || !activeProfile.expense?.orgId) {
            throw new Error('Expense profile or Org ID not configured.');
        }

        // Corresponds to your server.js: /api/get-fields
        const url = `/settings/fields?entity=${moduleName}`;
        const response = await makeApiCall('get', url, null, activeProfile, 'expense');
        
        // Zoho Expense usually returns { fields: [...] } or { data: [...] }
        const fields = response.data.fields || response.data.data || [];

        socket.emit('expenseFieldsResult', { success: true, fields: fields });

    } catch (error) {
        const { message } = parseError(error);
        socket.emit('expenseFieldsResult', { success: false, error: message });
    }
};

const handleCreateExpenseRecord = async (socket, data) => {
    const { activeProfile, moduleName, formData, waitForLog } = data;

    try {
        if (!activeProfile || !activeProfile.expense?.orgId) {
            throw new Error('Expense profile or Org ID not configured.');
        }

        // 1. CREATE RECORD
        const createUrl = `/${moduleName}`;
        // Zoho Expense expects JSON body directly
        const createResponse = await makeApiCall('post', createUrl, formData, activeProfile, 'expense');
        
        const resData = createResponse.data;
        let recordId = null;

        // Try to find ID in response (logic adapted from your server.js)
        const keys = Object.keys(resData);
        keys.forEach(k => {
            if (resData[k] && resData[k].module_record_id) recordId = resData[k].module_record_id;
            else if (resData[k] && resData[k].custom_module_id) recordId = resData[k].custom_module_id;
            else if (resData[k] && resData[k].id) recordId = resData[k].id;
        });

        // If we don't need to wait, just return success
        if (!waitForLog) {
            socket.emit('expenseCreateResult', { 
                success: true, 
                recordId: recordId || 'Unknown', 
                data: resData,
                logFound: false 
            });
            return;
        }

        if (!recordId) {
            throw new Error("Record created, but ID could not be parsed from response.");
        }

        // Notify client that we are waiting
        socket.emit('expenseLogStatus', { status: 'waiting', message: 'Record created. Waiting 10s to inspect logs...' });

        // 2. WAIT
        await wait(10000);

        // 3. INSPECT
        const detailUrl = `/${moduleName}/${recordId}`;
        const detailRes = await makeApiCall('get', detailUrl, null, activeProfile, 'expense');
        const body = detailRes.data;

        let recordData = null;
        // Find the main record object
        Object.keys(body).forEach(k => {
            if (typeof body[k] === 'object' && body[k].module_fields) {
                recordData = body[k];
            }
        });

        if (!recordData) {
             socket.emit('expenseCreateResult', { 
                success: true, 
                recordId, 
                logFound: false, 
                debugMessage: "Could not find 'module_fields' in GET response." 
            });
            return;
        }

        // Find 'cf_api_log'
        const fields = recordData.module_fields || [];
        const logField = fields.find(f => f.api_name === "cf_api_log");
        const logValue = logField ? logField.value : null;

        if (logValue && logValue.includes("API LOG")) {
             socket.emit('expenseCreateResult', { 
                success: true, 
                recordId, 
                logFound: true, 
                logMessage: logValue,
                fullRecord: recordData
            });
        } else {
             socket.emit('expenseCreateResult', { 
                success: true, 
                recordId, 
                logFound: false, 
                debugMessage: `Field 'cf_api_log' found but empty or missing keyword. Value: '${logValue}'`,
                fullRecord: recordData
            });
        }

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('expenseCreateResult', { success: false, error: message, fullResponse });
    }
};

module.exports = {
    setActiveJobs,
    handleGetExpenseFields,
    handleCreateExpenseRecord
}