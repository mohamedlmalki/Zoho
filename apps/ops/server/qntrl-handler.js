const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

/**
 * Helper: Fetches the form layout and builds a map of API Name -> Field Label
 */
async function getFieldMap(activeProfile, formId) {
    try {
        const orgId = activeProfile.qntrl?.orgId;
        if (!orgId) return {};

        // Reuse makeApiCall (read-only, so no log loop)
        const response = await makeApiCall(
            'get',
            `/blueprint/api/${orgId}/layout/${formId}`,
            null,
            activeProfile,
            'qntrl'
        );
        
        const map = {};
        const sections = response.data?.section_details || [];
        const allFields = sections.flatMap(section => section.sectionfieldmap_details || []);
        
        console.log(`[QNTRL DEBUG] Scanning ${allFields.length} fields in layout...`);

        allFields.forEach(field => {
            // Find the API name
            const details = field.customfield_details?.[0];
            // Try all possible properties where the API name might be hidden
            const api_name = details?.column_name || field.column_name || field.api_name; 
            const label = field.field_name;
            
            if (api_name && label) {
                map[api_name] = label;
                map[api_name.toLowerCase()] = label; // Store lowercase version for safe matching
                
                // --- DEBUG: Log specific fields to check if we are finding "E" ---
                if (label === "E" || api_name === "customfield_shorttext2") {
                    console.log(`[QNTRL DEBUG] FOUND TARGET FIELD! Label: "${label}" -> API: "${api_name}"`);
                }
            }
        });
        
        // Add standard field mapping
        map['title'] = 'Title';
        
        console.log(`[QNTRL] Built Field Map. Size: ${Object.keys(map).length}`);
        return map;
    } catch (e) {
        console.error("[QNTRL] Failed to fetch field map for logging:", e.message);
        return {}; // Return empty map if fails, logs will just show API names
    }
}

/**
 * Helper function to make the API call for creating a single Qntrl card.
 */
async function createCardApiCall(cardData, formId, activeProfile, orgId, fieldMap) {
    try {
        const payload = new URLSearchParams();
        
        for (const key in cardData) {
            if (cardData[key] !== null && cardData[key] !== undefined) {
                 payload.append(key, cardData[key]);
            }
        }
        payload.append('layout_id', formId);

        const apiResponse = await makeApiCall(
            'post',
            `/blueprint/api/${orgId}/job`,
            payload,
            activeProfile,
            'qntrl',
            {}, // queryParams
            fieldMap // <--- Pass the Field Map here!
        );

        const cardId = apiResponse.data?.id || 'Unknown';
        return {
            success: true,
            details: cardId,
            fullResponse: apiResponse.data,
        };
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        let detailedError = message;
        if (fullResponse?.errors) {
            const missingParam = Object.keys(fullResponse.errors)[0];
            detailedError = `Missing required parameter: ${missingParam}`;
        }

        return {
            success: false,
            error: detailedError,
            fullResponse: fullResponse,
        };
    }
}

const handler = {
    setActiveJobs: (jobs) => {
        activeJobs = jobs;
    },

    handleGetForms: async (socket, data) => {
        try {
            const { activeProfile } = data;
            const orgId = activeProfile.qntrl?.orgId;
            if (!orgId) throw new Error("Qntrl Organization ID is not configured.");

            const response = await makeApiCall(
                'get',
                `/blueprint/api/${orgId}/layout`, 
                null,
                activeProfile,
                'qntrl'
            );
            
            const forms = response.data?.layouts || response.data || [];
            socket.emit('qntrlFormsResult', { success: true, forms: forms });
        } catch (error) {
            const { message } = parseError(error);
            socket.emit('qntrlFormsResult', { success: false, error: message });
        }
    },

    handleGetFormDetails: async (socket, data) => {
        try {
            const { activeProfile, formId } = data;
            const orgId = activeProfile.qntrl?.orgId;
            if (!orgId) throw new Error("Qntrl Organization ID is not configured.");

            const response = await makeApiCall(
                'get',
                `/blueprint/api/${orgId}/layout/${formId}`, 
                null,
                activeProfile,
                'qntrl'
            );
            
            const sections = response.data?.section_details || [];
            const allFields = sections.flatMap(section => section.sectionfieldmap_details || []);

            const filteredFields = allFields.filter(field => {
                if (field.field_name === 'Title') return true;
                const details = field.customfield_details?.[0];
                if (details && details.entity_type_value === 'CUSTOMIZED') return true;
                return false;
            });

            const components = filteredFields.map(field => {
                const details = field.customfield_details?.[0];
                const api_name = details?.column_name || field.column_name;
                
                return {
                    field_label: field.field_name,
                    field_api_name: api_name, 
                    field_type: field.field_type,
                    is_mandatory: field.is_mandatory
                };
            });

            socket.emit('qntrlFormDetailsResult', { success: true, components: components });
        } catch (error) {
            const { message } = parseError(error);
            socket.emit('qntrlFormDetailsResult', { success: false, error: message });
        }
    },

    handleCreateCard: async (socket, data) => {
        try {
            const { activeProfile, cardData, formId } = data;
            const orgId = activeProfile.qntrl?.orgId;
            if (!orgId) throw new Error("Qntrl Organization ID is not configured.");

            // Fetch map for single card creation too
            const fieldMap = await getFieldMap(activeProfile, formId);

            const result = await createCardApiCall(cardData, formId, activeProfile, orgId, fieldMap);
            socket.emit('qntrlSingleCardResult', result);
        } catch (error) {
            const { message } = parseError(error);
            socket.emit('qntrlSingleCardResult', { success: false, error: message });
        }
    },

    handleStartBulkCreateCards: async (socket, data) => {
        const { selectedProfileName, activeProfile, totalToProcess } = data;
        const { selectedFormId, bulkPrimaryField, bulkPrimaryValues, bulkDefaultData, bulkDelay } = data.formData;
        const delay = (Number(bulkDelay) || 1) * 1000;
        const jobType = 'qntrl';
        const jobId = createJobId(socket.id, selectedProfileName, jobType);

        console.log(`[INFO] Starting bulk Qntrl card creation for ${selectedProfileName}. Job ID: ${jobId}`);
        activeJobs[jobId] = { status: 'running', total: totalToProcess, processed: 0 };

        try {
            const orgId = activeProfile.qntrl?.orgId;
            if (!orgId) throw new Error("Qntrl Organization ID is not configured.");
            
            if (!selectedFormId || !bulkPrimaryField || !bulkPrimaryValues) {
                throw new Error("Form, Primary Field, and Primary Values are required.");
            }

            // 1. Fetch Field Map ONCE at the start of the bulk job
            const fieldMap = await getFieldMap(activeProfile, selectedFormId);

            const primaryValues = bulkPrimaryValues.split('\n').filter(v => v.trim() !== '');

            for (const primaryValue of primaryValues) {
                if (activeJobs[jobId]?.status !== 'running') {
                    if (activeJobs[jobId]?.status === 'ended') {
                        socket.emit('bulkEnded', { profileName: selectedProfileName, jobType });
                        break;
                    }
                    if (activeJobs[jobId]?.status === 'paused') {
                        await new Promise(resolve => {
                            const interval = setInterval(() => {
                                if (activeJobs[jobId]?.status !== 'paused') {
                                    clearInterval(interval);
                                    resolve();
                                }
                            }, 1000);
                        });
                    }
                }

                const cardData = { ...bulkDefaultData };
                cardData[bulkPrimaryField] = primaryValue.trim();
                
                if (bulkPrimaryField !== 'title' && !cardData['title']) {
                    cardData['title'] = `Card ${primaryValue.trim()}`;
                }

                // Pass the fieldMap to the creator function
                const result = await createCardApiCall(cardData, selectedFormId, activeProfile, orgId, fieldMap);

                socket.emit('qntrlResult', {
                    ...result,
                    primaryValue: primaryValue.trim(),
                    profileName: selectedProfileName
                });

                activeJobs[jobId].processed++;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            if (activeJobs[jobId]?.status === 'running') {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType });
            }
        } catch (error) {
            console.error(`[ERROR] Job ${jobId}:`, error);
            const { message } = parseError(error);
            socket.emit('bulkError', { message, profileName: selectedProfileName, jobType });
        } finally {
            delete activeJobs[jobId];
            console.log(`[INFO] Job ${jobId} finished.`);
        }
    },
};

module.exports = handler;