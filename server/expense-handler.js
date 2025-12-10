// --- FILE: server/expense-handler.js ---

const { makeApiCall, parseError } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. FETCH FIELDS ---
const handleGetExpenseFields = async (socket, data) => {
    const { selectedProfileName, moduleName } = data;
    console.log(`\n[ExpenseHandler] 🔍 Fetching fields for module '${moduleName}' (Profile: ${selectedProfileName})`);

    const profiles = require('./utils').readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile || !activeProfile.expense || !activeProfile.expense.orgId) {
        socket.emit('expenseError', { message: 'Profile or Org ID missing.' });
        return;
    }

    try {
        const fieldsUrl = `/settings/fields?entity=${moduleName}`;
        const response = await makeApiCall('get', fieldsUrl, null, activeProfile, 'expense');
        
        const fields = response.data.fields || response.data.data || [];
        console.log(`[ExpenseHandler] ✅ Found ${fields.length} fields.`);
        
        // Map to a clean format for the frontend
        const mappedFields = fields.map(f => ({
            label: f.label,
            api_name: f.api_name,
            data_type: f.data_type,
            is_mandatory: f.is_mandatory,
            is_system: f.is_system,
            is_read_only: f.is_read_only
        }));

        socket.emit('expenseFieldsFetched', mappedFields);

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('expenseError', { message: `Failed to fetch fields: ${message}`, fullResponse });
    }
};

// --- 2. SINGLE RECORD CREATION ---
const handleCreateExpenseRecord = async (socket, data) => {
    const { selectedProfileName, moduleName, formData } = data;
    console.log(`\n[ExpenseHandler] 📝 Creating SINGLE record in '${moduleName}'`);

    const profiles = require('./utils').readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    try {
        const createUrl = `/${moduleName}`;
        const response = await makeApiCall('post', createUrl, formData, activeProfile, 'expense');
        
        console.log(`[ExpenseHandler] ✅ Single Record Created.`);
        socket.emit('createExpenseRecordResult', { 
            success: true, 
            data: response.data 
        });

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('createExpenseRecordResult', { 
            success: false, 
            error: message,
            fullResponse 
        });
    }
};

// --- 3. BULK CREATION HANDLER ---
const handleStartBulkExpenseCreation = async (socket, data) => {
    const { selectedProfileName, moduleName, primaryFieldName, bulkValues, defaultData = {}, bulkDelay = 0 } = data;
    
    // Parse Bulk Values
    const valuesToProcess = bulkValues.split('\n').map(v => v.trim()).filter(v => v);
    const total = valuesToProcess.length;

    console.log(`\n[ExpenseHandler] 🚀 START BULK: ${total} records for module '${moduleName}'`);

    const profiles = require('./utils').readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile) return;

    // Fetch fields metadata once for "Smart Auto-fill"
    let fields = [];
    try {
        const fieldsResp = await makeApiCall('get', `/settings/fields?entity=${moduleName}`, null, activeProfile, 'expense');
        fields = fieldsResp.data.fields || fieldsResp.data.data || [];
    } catch (e) {
        console.warn("[ExpenseHandler] ⚠️ Could not fetch fields for auto-fill.");
    }

    // Process Loop
    for (let i = 0; i < total; i++) {
        const currentValue = valuesToProcess[i];
        
        // 1. Build Payload: Start with Default Data from Frontend
        const payload = { ...defaultData };
        
        // 2. Overwrite Primary Field with Bulk Value
        payload[primaryFieldName] = currentValue;

        // 3. Smart Auto-fill: Fill MISSING mandatory fields that weren't in defaultData
        fields.forEach(f => {
            if (f.is_mandatory && !f.is_system && payload[f.api_name] === undefined) {
                if (f.data_type === 'text' || f.data_type === 'string') payload[f.api_name] = `Auto ${f.label}`;
                else if (f.data_type === 'date') payload[f.api_name] = new Date().toISOString().split('T')[0];
                else if (['integer', 'double', 'currency', 'amount'].includes(f.data_type)) payload[f.api_name] = 100;
                else if (f.data_type === 'boolean') payload[f.api_name] = true;
            }
        });

        // 4. Send Request
        try {
            socket.emit('expenseBulkUpdate', { 
                message: `[${i + 1}/${total}] Creating: "${currentValue}"`, 
                progress: Math.round(((i + 1) / total) * 100) 
            });

            const createUrl = `/${moduleName}`;
            const response = await makeApiCall('post', createUrl, payload, activeProfile, 'expense');
            const resData = response.data;

            // Try to find ID
            let recordId = null;
            if (resData.custom_module && resData.custom_module.id) recordId = resData.custom_module.id;
            else if (resData.id) recordId = resData.id;
            else if (resData.module_record_id) recordId = resData.module_record_id;

            if (recordId) {
                socket.emit('expenseBulkResult', { 
                    success: true, 
                    value: currentValue, 
                    message: `ID: ${recordId}`,
                    recordId: recordId
                });
            } else {
                // Sometimes success doesn't return an ID immediately in some modules
                socket.emit('expenseBulkResult', { 
                    success: true, 
                    value: currentValue, 
                    message: "Success (No ID returned)",
                    fullResponse: resData
                });
            }

        } catch (error) {
            const { message } = parseError(error);
            socket.emit('expenseBulkResult', { 
                success: false, 
                value: currentValue, 
                message: message 
            });
        }

        // Delay
        if (bulkDelay > 0) await sleep(bulkDelay * 1000);
    }

    socket.emit('expenseBulkUpdate', { message: "✅ Bulk Operation Complete!", progress: 100 });
};

// Keep old test handler for backward compatibility if needed
const handleTestCustomModule = async (socket, data) => { /* ... */ };

module.exports = {
    setActiveJobs,
    handleGetExpenseFields,
    handleCreateExpenseRecord,
    handleStartBulkExpenseCreation,
    handleTestCustomModule
};