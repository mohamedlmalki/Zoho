// --- FILE: server/expense-handler.js ---

const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Verify Log (ASYNC / NON-BLOCKING) ---
const verifyExpenseLog = async (socket, params, jobId) => {
    const { activeProfile, moduleName, recordId, primaryValue, profileName } = params;
    
    // 1. Wait 10 seconds (Background)
    await sleep(10000);

    // 2. CHECK IF JOB EXISTENCE
    if (!activeJobs[jobId]) return;

    let verifySuccess = false;
    let verifyData = null;
    let errorMessage = null;

    try {
        const url = `/${moduleName}/${recordId}`;
        const response = await makeApiCall('get', url, null, activeProfile, 'expense');
        verifyData = response.data;

        let recordData = null;
        const getID = (obj) => obj?.module_record_id || obj?.id || obj?.custom_module_id;
        
        if (getID(verifyData)) recordData = verifyData;
        else {
            Object.keys(verifyData).forEach(k => {
                if (typeof verifyData[k] === 'object' && verifyData[k] !== null && getID(verifyData[k])) {
                    recordData = verifyData[k];
                }
            });
        }

        if (!recordData) throw new Error("Could not parse record data.");

        let fields = recordData.module_fields || recordData.custom_fields || [];
        if (!Array.isArray(fields) || fields.length === 0) {
             Object.keys(recordData).forEach(key => {
                 if (key.startsWith('cf_')) fields.push({ api_name: key, value: recordData[key] });
             });
        }

        const logField = fields.find(f => f.api_name === "cf_api_log" || f.label === "API Log");
        const logValue = logField ? logField.value : null;

        if (logValue && String(logValue).trim().length > 0) {
            verifySuccess = true;
            socket.emit('expenseUpdate', { 
                recordId,
                primaryValue,
                success: true, 
                details: `✅ Verified: ${String(logValue).substring(0, 50)}...`,
                verificationResponse: verifyData,
                profileName
            });
        } else {
            errorMessage = "❌ Verification Failed: 'cf_api_log' is empty.";
            socket.emit('expenseUpdate', { 
                recordId,
                primaryValue,
                success: false, 
                error: errorMessage,
                verificationResponse: verifyData,
                profileName
            });
        }

    } catch (error) {
        errorMessage = `Verification Error: ${error.message}`;
        socket.emit('expenseUpdate', { 
            recordId,
            primaryValue,
            success: false, 
            error: errorMessage,
            verificationResponse: { error: error.message },
            profileName
        });
    }

    // --- ASYNC AUTO-PAUSE LOGIC (DEBOUNCED) ---
    if (activeJobs[jobId]) {
        activeJobs[jobId].pendingVerifications--;

        if (!verifySuccess) {
            activeJobs[jobId].consecutiveFailures++;
            console.log(`[AUTO-PAUSE] ❌ Failure Detected (${primaryValue}). Count: ${activeJobs[jobId].consecutiveFailures} / Limit: ${activeJobs[jobId].stopAfterFailures}`);

            if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                
                // FIX: Check if ALREADY paused to prevent multiple alerts
                if (activeJobs[jobId].status !== 'paused') {
                    console.log(`[AUTO-PAUSE] 🛑 LIMIT REACHED. PAUSING JOB NOW.`);
                    activeJobs[jobId].status = 'paused'; 
                    socket.emit('jobPaused', { 
                        profileName: profileName, 
                        jobType: 'expense',
                        reason: `Auto-paused after ${activeJobs[jobId].consecutiveFailures} consecutive failures.` 
                    });
                }
            }
        } else {
            activeJobs[jobId].consecutiveFailures = 0;
        }

        // Cleanup if job is fully done
        if (activeJobs[jobId].isLoopFinished && activeJobs[jobId].pendingVerifications <= 0) {
            delete activeJobs[jobId];
        }
    }
};

const handleGetExpenseFields = async (socket, data) => {
    const { selectedProfileName, moduleName } = data;
    const profiles = require('./utils').readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
    if (!activeProfile) return socket.emit('expenseError', { message: 'Profile not found.' });

    try {
        const response = await makeApiCall('get', `/settings/fields?entity=${moduleName}`, null, activeProfile, 'expense');
        const fields = response.data.fields || response.data.data || [];
        const mappedFields = fields.map(f => ({ label: f.label, api_name: f.api_name, data_type: f.data_type || 'text', is_mandatory: f.is_mandatory, is_system: f.is_system, is_read_only: f.is_read_only }));
        socket.emit('expenseFieldsFetched', mappedFields);
    } catch (error) { socket.emit('expenseError', { message: `Failed to fetch fields: ${parseError(error).message}` }); }
};

const handleCreateExpenseRecord = async (socket, data) => { };

// --- BULK CREATION HANDLER ---
const handleStartBulkExpenseCreation = async (socket, data) => {
    const { selectedProfileName, moduleName, primaryFieldName, bulkValues, defaultData = {}, bulkDelay = 0, verifyLog = false, stopAfterFailures = 0 } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'expense');
    
    activeJobs[jobId] = { 
        status: 'running', 
        consecutiveFailures: 0,
        stopAfterFailures: Number(stopAfterFailures) || 0,
        pendingVerifications: 0, 
        isLoopFinished: false   
    };

    const valuesToProcess = bulkValues.split('\n').map(v => v.trim()).filter(v => v);
    const total = valuesToProcess.length;

    console.log(`\n[ExpenseHandler] 🚀 START BULK: ${total} records. Verify: ${verifyLog}. StopAfter: ${activeJobs[jobId].stopAfterFailures}`);

    const profiles = require('./utils').readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    if (!activeProfile) return socket.emit('expenseError', { message: 'Profile not found.' });

    let fields = [];
    try {
        const fieldsResp = await makeApiCall('get', `/settings/fields?entity=${moduleName}`, null, activeProfile, 'expense');
        fields = fieldsResp.data.fields || fieldsResp.data.data || [];
    } catch (e) { /* ignore */ }

    try {
        for (let i = 0; i < total; i++) {
            // 1. CHECK PAUSE (Catches async pause signals)
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            
            while (activeJobs[jobId]?.status === 'paused') {
                await sleep(500);
            }

            const currentValue = valuesToProcess[i];
            const payload = { ...defaultData };
            payload[primaryFieldName] = currentValue;

            fields.forEach(f => {
                const apiName = f.api_name || f.field_name;
                if (f.is_mandatory && !f.is_system && payload[apiName] === undefined) {
                    if (f.data_type === 'text') payload[apiName] = `Auto ${f.label || 'Value'}`;
                    else if (f.data_type === 'date') payload[apiName] = new Date().toISOString().split('T')[0];
                    else if (['integer', 'double', 'currency', 'amount'].includes(f.data_type)) payload[apiName] = 100;
                    else if (f.data_type === 'boolean') payload[apiName] = true;
                }
            });

            try {
                socket.emit('expenseBulkUpdate', { 
                    message: `[${i + 1}/${total}] Creating: "${currentValue}"`, 
                    progress: Math.round(((i + 1) / total) * 100),
                    profileName: selectedProfileName
                });

                const createUrl = `/${moduleName}`;
                const response = await makeApiCall('post', createUrl, payload, activeProfile, 'expense');
                const resData = response.data;

                // Extract ID
                let recordId = null;
                const getID = (obj) => obj?.module_record_id || obj?.id || obj?.custom_module_id;
                if (getID(resData.module_record)) recordId = getID(resData.module_record);
                else if (getID(resData[moduleName])) recordId = getID(resData[moduleName]);
                else if (getID(resData)) recordId = getID(resData);
                else if (getID(resData.custom_module)) recordId = getID(resData.custom_module);

                if (recordId) {
                    // [CLEAN LOGS] Success logs removed
                    
                    socket.emit('expenseBulkResult', { 
                        success: true, 
                        value: currentValue, 
                        message: `ID: ${recordId} ${verifyLog ? '(Verifying...)' : ''}`, 
                        recordId: recordId,
                        fullResponse: resData,
                        profileName: selectedProfileName
                    });

                    if (verifyLog) {
                        if (activeJobs[jobId]) activeJobs[jobId].pendingVerifications++;
                        verifyExpenseLog(socket, { 
                            activeProfile, 
                            moduleName, 
                            recordId, 
                            primaryValue: currentValue,
                            profileName: selectedProfileName
                        }, jobId); 
                    } else {
                        if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures = 0;
                    }

                } else {
                    console.warn(`[ExpenseHandler] ⚠️ ID MISSING for ${currentValue}`);
                    if (activeJobs[jobId]) activeJobs[jobId].consecutiveFailures++;
                    
                    socket.emit('expenseBulkResult', { 
                        success: true, 
                        value: currentValue, 
                        message: "Success (No ID returned)", 
                        fullResponse: resData,
                        profileName: selectedProfileName
                    });
                }

            } catch (error) {
                const { message } = parseError(error);
                console.error(`[ExpenseHandler] ❌ Creation Error (${currentValue}): ${message}`);
                
                if (activeJobs[jobId]) {
                    activeJobs[jobId].consecutiveFailures++;
                    if (activeJobs[jobId].stopAfterFailures > 0 && activeJobs[jobId].consecutiveFailures >= activeJobs[jobId].stopAfterFailures) {
                        
                        // FIX: Check if ALREADY paused to prevent multiple alerts
                        if (activeJobs[jobId].status !== 'paused') {
                            activeJobs[jobId].status = 'paused';
                            socket.emit('jobPaused', { 
                                profileName: selectedProfileName, 
                                jobType: 'expense',
                                reason: `Auto-paused after ${activeJobs[jobId].consecutiveFailures} API failures.` 
                            });
                        }
                    }
                }

                socket.emit('expenseBulkResult', { 
                    success: false, 
                    value: currentValue, 
                    message: message,
                    profileName: selectedProfileName
                });
            }

            if (bulkDelay > 0) await sleep(bulkDelay * 1000);
        }
    } catch (err) {
        console.error("[ExpenseHandler] Critical Bulk Error:", err);
    } finally {
        socket.emit('bulkComplete', { 
            profileName: selectedProfileName, 
            jobType: 'expense',
            message: "Bulk Operation Complete" 
        });

        if (activeJobs[jobId]) {
            activeJobs[jobId].isLoopFinished = true;
            if (activeJobs[jobId].pendingVerifications <= 0) {
                delete activeJobs[jobId];
            }
        }
    }
};

module.exports = {
    setActiveJobs,
    handleGetExpenseFields,
    handleCreateExpenseRecord,
    handleStartBulkExpenseCreation,
    handleTestCustomModule: async () => {}
};