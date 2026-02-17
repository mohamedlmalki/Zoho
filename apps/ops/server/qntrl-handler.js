const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

/**
 * Helper function to make the API call for creating a single Qntrl card.
 * @param {object} cardData - The data payload for the new card (e..g, { title: "...", customfield_shorttext1: "..." }).
 * @param {string} formId - The ID of the form (layout).
 * @param {object} activeProfile - The active profile object.
 * @param {string} orgId - The Qntrl Org ID.
 * @returns {Promise<object>} - A promise that resolves to a result object.
 */
async function createCardApiCall(cardData, formId, activeProfile, orgId) {
    try {
        // --- THIS IS THE FIX (Problem 2) ---
        // The API expects 'application/x-www-form-urlencoded' data, not JSON.
        // We create URLSearchParams to format the data correctly.
        
        const payload = new URLSearchParams();
        
        // Add all the data from the form (like 'title', 'customfield_shorttext1', etc.)
        for (const key in cardData) {
            // Only add the parameter if it has a value
            if (cardData[key] !== null && cardData[key] !== undefined) {
                 payload.append(key, cardData[key]);
            }
        }
        
        // Add the mandatory 'layout_id'
        payload.append('layout_id', formId);

        // 3. Use the correct API endpoint: /blueprint/api/{org_id}/job
        const apiResponse = await makeApiCall(
            'post',
            `/blueprint/api/${orgId}/job`,
            payload, // Send the data as URLSearchParams
            activeProfile,
            'qntrl'
        );
        // --- END OF FIX ---

        const cardId = apiResponse.data?.id || 'Unknown';
        return {
            success: true,
            details: cardId,
            fullResponse: apiResponse.data,
        };
    } catch (error) {
        // Handle "Failed Input parameter is missing"
        const { message, fullResponse } = parseError(error);
        
        let detailedError = message;
        // Make the error message more helpful
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
                `/blueprint/api/${orgId}/layout`, // Corrected URL
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
                `/blueprint/api/${orgId}/layout/${formId}`, // Corrected URL
                null,
                activeProfile,
                'qntrl'
            );
            
            const sections = response.data?.section_details || [];
            
            const allFields = sections.flatMap(section => section.sectionfieldmap_details || []);

            const filteredFields = allFields.filter(field => {
                if (field.field_name === 'Title') {
                    return true;
                }
                const details = field.customfield_details?.[0];
                if (details && details.entity_type_value === 'CUSTOMIZED') {
                    return true;
                }
                return false;
            });

            // --- THIS IS THE FIX (Problem 1) ---
            // The API name is in the customfield_details array, not the top-level column_name.
            const components = filteredFields.map(field => {
                const details = field.customfield_details?.[0];
                
                // Use the nested 'column_name' if it exists, otherwise fall back to the top one.
                // This gets the REAL API name (e.g., 'title', 'customfield_shorttext1')
                const api_name = details?.column_name || field.column_name;
                
                return {
                    field_label: field.field_name,
                    field_api_name: api_name, 
                    field_type: field.field_type,
                    is_mandatory: field.is_mandatory
                };
            });
            // --- END OF FIX ---

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

            const result = await createCardApiCall(cardData, formId, activeProfile, orgId);
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

            const primaryValues = bulkPrimaryValues.split('\n').filter(v => v.trim() !== '');

            for (const primaryValue of primaryValues) {
                if (activeJobs[jobId]?.status !== 'running') {
                    if (activeJobs[jobId]?.status === 'ended') {
                        console.log(`[INFO] Job ${jobId} ended by user.`);
                        socket.emit('bulkEnded', { profileName: selectedProfileName, jobType });
                        break;
                    }
                    if (activeJobs[jobId]?.status === 'paused') {
                        console.log(`[INFO] Job ${jobId} paused.`);
                        await new Promise(resolve => {
                            const interval = setInterval(() => {
                                if (activeJobs[jobId]?.status !== 'paused') {
                                    clearInterval(interval);
                                    resolve();
                                }
                            }, 1000);
                        });
                        console.log(`[INFO] Job ${jobId} resumed.`);
                    }
                }

                // Construct the data for this specific card
                const cardData = { ...bulkDefaultData };
                cardData[bulkPrimaryField] = primaryValue.trim();
                
                // If 'title' isn't the primary field and isn't in default data, add a default
                // This prevents the "Missing required parameter: title" error
                if (bulkPrimaryField !== 'title' && !cardData['title']) {
                    cardData['title'] = `Card ${primaryValue.trim()}`;
                }

                const result = await createCardApiCall(cardData, selectedFormId, activeProfile, orgId);

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