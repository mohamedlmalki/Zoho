// --- FILE: server/bookings-handler.js ---

const { makeApiCall, parseError, createJobId } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

// --- HELPER: Format Date for Zoho (dd-MMM-yyyy HH:mm:ss) ---
const formatZohoDate = (dateObj) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const MMM = months[dateObj.getMonth()];
    const yyyy = dateObj.getFullYear();
    const HH = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    const ss = String(dateObj.getSeconds()).padStart(2, '0');
    return `${dd}-${MMM}-${yyyy} ${HH}:${mm}:${ss}`;
};

// --- HELPER: Round to Nearest 5 Minutes ---
const roundToNearest5 = (date) => {
    const coeff = 1000 * 60 * 5; 
    return new Date(Math.round(date.getTime() / coeff) * coeff);
};

// --- HELPER: Check and Adjust for Working Hours ---
const checkAndAdjustWorkHours = (date, workStart, workEnd) => {
    if (date.getHours() >= parseInt(workEnd)) {
        date.setDate(date.getDate() + 1);
        date.setHours(parseInt(workStart), 0, 0, 0);
    } else if (date.getHours() < parseInt(workStart)) {
        date.setHours(parseInt(workStart), 0, 0, 0);
    }
    if (date.getDay() === 0) { // Sunday
        date.setDate(date.getDate() + 1);
        date.setHours(parseInt(workStart), 0, 0, 0);
    } else if (date.getDay() === 6) { // Saturday
        date.setDate(date.getDate() + 2);
        date.setHours(parseInt(workStart), 0, 0, 0);
    }
    return date;
};

// --- 1. FETCH SERVICES ---
const handleFetchBookingServices = async (socket, { profileName, activeProfile }) => {
    try {
        if (!activeProfile.bookings || !activeProfile.bookings.workspaceId) throw new Error("Workspace ID not found.");
        const response = await makeApiCall('get', '/services', { workspace_id: activeProfile.bookings.workspaceId }, activeProfile, 'bookings');
        
        if (response.data.response && response.data.response.returnvalue) {
            const servicesList = response.data.response.returnvalue.data || [];
            socket.emit('bookingServicesResult', { success: true, data: servicesList });
        } else {
            throw new Error("Invalid response from Zoho");
        }
    } catch (error) {
        socket.emit('bookingServicesResult', { success: false, error: error.message });
    }
};

// --- 2. FETCH STAFF ---
const handleFetchBookingStaff = async (socket, { profileName, activeProfile }) => {
    try {
        if (!activeProfile.bookings || !activeProfile.bookings.workspaceId) throw new Error("Workspace ID not found.");
        const response = await makeApiCall('get', '/staffs', { workspace_id: activeProfile.bookings.workspaceId }, activeProfile, 'bookings');
        if (response.data.response && response.data.response.returnvalue) {
            const list = response.data.response.returnvalue.data || [];
            socket.emit('bookingStaffResult', { success: true, data: list });
        } else {
            throw new Error("Invalid response from Zoho");
        }
    } catch (error) {
        socket.emit('bookingStaffResult', { success: false, error: error.message });
    }
};

// --- 3. DELETE SERVICE ---
const handleDeleteBookingService = async (socket, { serviceId, selectedProfileName, activeProfile }) => {
    try {
        const params = new URLSearchParams();
        params.append('id', serviceId);
        // Also send service_id just in case, as some Zoho versions vary
        params.append('service_id', serviceId);

        const response = await makeApiCall('post', '/deleteservice', params, activeProfile, 'bookings');
        const result = response.data;
        if (result.response && result.response.status === 'success') {
            // Even if returnvalue is missing, status success means it worked
            socket.emit('deleteBookingServiceResult', { success: true, message: "Service deleted." });
        } else {
            let errMsg = result.response?.message || "Unknown error";
            if (result.response?.returnvalue?.message) errMsg = result.response.returnvalue.message;
            socket.emit('deleteBookingServiceResult', { success: false, error: errMsg });
        }
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('deleteBookingServiceResult', { success: false, error: message });
    }
};

// --- 4. CREATE SERVICE ---
const handleCreateBookingService = async (socket, data) => {
    console.log("[CreateService] Started. Profile:", data.selectedProfileName);
    const { name, type, duration, cost, description, assignedStaff, selectedProfileName, activeProfile } = data;

    try {
        if (!activeProfile.bookings || !activeProfile.bookings.workspaceId) throw new Error("Workspace ID not found.");

        const serviceData = {
            name: name,
            workspace_id: activeProfile.bookings.workspaceId,
            duration: String(duration || 30),
            cost: String(cost || 0),
            description: description || ""
        };

        if (assignedStaff && assignedStaff.length > 0) {
            serviceData.assigned_staffs = JSON.stringify(assignedStaff);
        }

        const params = new URLSearchParams();
        params.append('data', JSON.stringify(serviceData));

        const response = await makeApiCall('post', '/createservice', params, activeProfile, 'bookings');
        const result = response.data;

        if (result.response && result.response.status === 'success') {
            const successMsg = result.response.returnvalue ? result.response.returnvalue.message : "Service created successfully.";
            socket.emit('createBookingServiceResult', { success: true, message: successMsg });
        } else {
            let errMsg = result.response?.message || "Creation failed.";
            if (result.response?.returnvalue?.message) errMsg = result.response.returnvalue.message;
            if (result.response?.errormessage) errMsg = result.response.errormessage;
            socket.emit('createBookingServiceResult', { success: false, error: errMsg });
        }
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('createBookingServiceResult', { success: false, error: message });
    }
};

// --- 5. BULK BOOKING LOGIC ---
const handleStartBulkBooking = async (socket, data) => {
    const { 
        emails, defName, defPhone, serviceId, staffId, 
        startTimeStr, timeGap, workStart, workEnd, timezone,
        delay = 1, stopAfterFailures = 0, 
        selectedProfileName, activeProfile 
    } = data;

    const jobId = createJobId(socket.id, selectedProfileName, 'bookings');
    activeJobs[jobId] = { status: 'running' };
    let failureCount = 0;

    try {
        let currentTime = new Date(startTimeStr);
        currentTime = checkAndAdjustWorkHours(currentTime, workStart, workEnd);

        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') { await new Promise(r => setTimeout(r, 500)); }

            if (stopAfterFailures > 0 && failureCount >= stopAfterFailures) {
                socket.emit('jobPaused', { profileName: selectedProfileName, reason: `Job paused automatically.`, jobType: 'bookings' });
                activeJobs[jobId].status = 'paused';
                while (activeJobs[jobId]?.status === 'paused') { await new Promise(r => setTimeout(r, 1000)); }
                failureCount = 0; 
            }

            const email = emails[i];
            if (i > 0) currentTime.setMinutes(currentTime.getMinutes() + parseInt(timeGap));
            currentTime = checkAndAdjustWorkHours(currentTime, workStart, workEnd);

            let booked = false;
            let huntAttempts = 0;
            let dayFailures = 0; 
            const MAX_HUNT_ATTEMPTS = 100;

            while (!booked && huntAttempts < MAX_HUNT_ATTEMPTS) {
                const roundedTime = roundToNearest5(currentTime);
                const finalTimeObj = checkAndAdjustWorkHours(roundedTime, workStart, workEnd);
                const formattedTime = formatZohoDate(finalTimeObj);

                const params = new URLSearchParams();
                params.append('service_id', serviceId);
                params.append('staff_id', staffId);
                params.append('from_time', formattedTime);
                params.append('timezone', timezone || 'UTC'); 
                const customerDetails = JSON.stringify({ name: `${defName} ${i + 1}`, email: email, phone_number: defPhone });
                params.append('customer_details', customerDetails);

                try {
                    const response = await makeApiCall('post', '/appointment', params, activeProfile, 'bookings');
                    const result = response.data;

                    const isOuterSuccess = result.response && result.response.status === 'success';
                    const isInnerFailure = result.response?.returnvalue?.status === 'failure';

                    if (isOuterSuccess && !isInnerFailure) {
                        let bookingId = 'Success';
                        if (result.response.returnvalue) {
                            if (typeof result.response.returnvalue === 'object') {
                                bookingId = result.response.returnvalue.booking_id || 'ID_Not_Found';
                            } else {
                                bookingId = result.response.returnvalue; 
                            }
                        }
                        socket.emit('bookingResult', { email, success: true, time: formattedTime, details: `ID: ${bookingId}`, fullResponse: result, profileName: selectedProfileName });
                        booked = true; 
                    } else {
                        let errorMsg = result.response?.message || "Unknown Error";
                        if (isInnerFailure && result.response.returnvalue.message) errorMsg = result.response.returnvalue.message;
                        
                        if (errorMsg.toLowerCase().includes("slot") || errorMsg.toLowerCase().includes("not available")) {
                            huntAttempts++;
                            dayFailures++;
                            if (dayFailures >= 3) {
                                currentTime.setDate(currentTime.getDate() + 1);
                                currentTime.setHours(parseInt(workStart), 0, 0, 0);
                                dayFailures = 0; 
                            } else {
                                const jump = Math.max(30, parseInt(timeGap));
                                currentTime.setMinutes(currentTime.getMinutes() + jump);
                            }
                        } else {
                            throw new Error(errorMsg); 
                        }
                    }
                } catch (error) {
                    failureCount++;
                    const { message, fullResponse } = parseError(error);
                    socket.emit('bookingResult', { email, success: false, time: formattedTime, error: message, fullResponse: fullResponse || error.response?.data, profileName: selectedProfileName });
                    booked = true; 
                }
                
                if (!booked) await new Promise(r => setTimeout(r, 200)); 
            }

            const delayTime = delay ? parseInt(delay) * 1000 : 1000;
            await new Promise(r => setTimeout(r, delayTime)); 
        }
    } catch (error) {
        socket.emit('bulkError', { message: error.message, profileName: selectedProfileName, jobType: 'bookings' });
    } finally {
        if (activeJobs[jobId]) {
            socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'bookings' });
            delete activeJobs[jobId];
        }
    }
};

// --- 6. FETCH APPOINTMENTS (PAGINATION FIX) ---
const handleFetchAppointments = async (socket, data) => {
    const { fromDate, toDate, status, activeProfile } = data;
    console.log(`[Bookings] Fetching ALL appointments for ${activeProfile.profileName}...`);

    try {
        if (!activeProfile.bookings?.workspaceId) throw new Error("Workspace ID not found.");

        const start = fromDate ? new Date(fromDate) : new Date();
        start.setHours(0, 0, 0, 0); 
        const end = toDate ? new Date(toDate) : new Date();
        end.setHours(23, 59, 59, 999); 
        const startStr = formatZohoDate(start);
        const endStr = formatZohoDate(end);

        let allAppointments = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            console.log(`[Bookings] Fetching Page ${page}...`);

            const requestBody = {
                from_time: startStr,
                to_time: endStr,
                need_customer_more_info: "true",
                per_page: "100", 
                page: String(page) 
            };

            if (status && status !== 'all') {
                requestBody.status = status;
            }

            const params = new URLSearchParams();
            params.append('data', JSON.stringify(requestBody));

            const response = await makeApiCall('post', '/fetchappointment', params, activeProfile, 'bookings');
            const result = response.data;

            if (result.response && result.response.status === 'success') {
                const returnValue = result.response.returnvalue;
                let pageAppointments = [];
                
                if (Array.isArray(returnValue)) {
                    pageAppointments = returnValue;
                } else if (returnValue && Array.isArray(returnValue.response)) {
                    pageAppointments = returnValue.response;
                } else if (returnValue && Array.isArray(returnValue.data)) {
                    pageAppointments = returnValue.data;
                }

                if (pageAppointments.length > 0) {
                    allAppointments = [...allAppointments, ...pageAppointments];
                    console.log(`[Bookings] Page ${page} loaded ${pageAppointments.length} items. Total: ${allAppointments.length}`);
                    
                    if (returnValue.next_page_available === true || returnValue.next_page_available === "true") {
                        page++;
                        await new Promise(r => setTimeout(r, 200)); 
                    } else {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            } else {
                console.warn("[Bookings] Page fetch failed or empty:", result);
                hasMore = false;
            }
        }

        console.log(`[Bookings] Finished. Total Appointments: ${allAppointments.length}`);
        socket.emit('fetchAppointmentsResult', { success: true, data: allAppointments });

    } catch (error) {
        console.error("[Bookings] Fetch Error:", error.message);
        const { message } = parseError(error);
        socket.emit('fetchAppointmentsResult', { success: false, error: message });
    }
};

// --- 7. UPDATE APPOINTMENT STATUS ---
const handleUpdateAppointmentStatus = async (socket, data) => {
    const { bookingId, action, activeProfile } = data; 
    console.log(`[Bookings] Updating ${bookingId} to ${action}...`);

    try {
        if (!activeProfile.bookings?.workspaceId) throw new Error("Workspace ID not found.");

        const params = new URLSearchParams();
        params.append('booking_id', bookingId);
        params.append('action', action);

        const response = await makeApiCall('post', '/updateappointment', params, activeProfile, 'bookings');
        const result = response.data;

        if (result.response && result.response.status === 'success') {
            console.log(`[Bookings] Update Success.`);
            socket.emit('updateAppointmentResult', { 
                success: true, 
                message: `Appointment updated to ${action}.`,
                bookingId, 
                action
            });
        } else {
            let errMsg = result.response?.message || "Update failed.";
            console.error(`[Bookings] Update Failed:`, errMsg);
            socket.emit('updateAppointmentResult', { success: false, error: errMsg });
        }
    } catch (error) {
        const { message } = parseError(error);
        console.error(`[Bookings] Update Error:`, message);
        socket.emit('updateAppointmentResult', { success: false, error: message });
    }
};

// --- 8. BULK UPDATE APPOINTMENT STATUS (OPTIMIZED) ---
const handleBulkUpdateAppointmentStatus = async (socket, data) => {
    const { bookingIds, action, activeProfile } = data;
    console.log(`[Bookings] Bulk Updating ${bookingIds.length} appointments to ${action} (Optimized)...`);

    try {
        if (!activeProfile.bookings?.workspaceId) throw new Error("Workspace ID not found.");

        let successCount = 0;
        let failCount = 0;
        const successfulIds = [];
        
        // --- BATCH PROCESSING (5 Concurrent Requests) ---
        const BATCH_SIZE = 5;

        for (let i = 0; i < bookingIds.length; i += BATCH_SIZE) {
            const batch = bookingIds.slice(i, i + BATCH_SIZE);
            
            // Execute batch in parallel
            await Promise.all(batch.map(async (bookingId) => {
                try {
                    const params = new URLSearchParams();
                    params.append('booking_id', bookingId);
                    params.append('action', action);

                    const response = await makeApiCall('post', '/updateappointment', params, activeProfile, 'bookings');
                    const result = response.data;

                    if (result.response && result.response.status === 'success') {
                        successCount++;
                        successfulIds.push(bookingId); // Track success
                    } else {
                        failCount++;
                        console.warn(`[Bookings] Failed to update ${bookingId}:`, result.response?.message);
                    }
                } catch (err) {
                    failCount++;
                    console.error(`[Bookings] Error updating ${bookingId}:`, err.message);
                }
            }));

            // Progress Update
            const processedCount = Math.min(i + BATCH_SIZE, bookingIds.length);
            const progress = Math.round((processedCount / bookingIds.length) * 100);
            
            socket.emit('bulkUpdateProgress', { 
                progress, 
                processed: processedCount, 
                total: bookingIds.length 
            });

            // Small delay between batches to respect rate limits
            if (i + BATCH_SIZE < bookingIds.length) {
                await new Promise(r => setTimeout(r, 500)); 
            }
        }

        socket.emit('bulkUpdateAppointmentResult', {
            success: true,
            message: `Bulk Action Complete. Success: ${successCount}, Failed: ${failCount}`,
            updatedCount: successCount,
            successfulIds: successfulIds, // Send successful IDs back for optimistic UI update
            action: action // Send action back so frontend knows what status to set
        });

    } catch (error) {
        console.error("[Bookings] Bulk Update Error:", error.message);
        socket.emit('bulkUpdateAppointmentResult', { success: false, error: error.message });
    }
};

module.exports = {
    setActiveJobs,
    handleFetchBookingServices,
    handleFetchBookingStaff,
    handleStartBulkBooking,
    handleDeleteBookingService,
    handleCreateBookingService,
    handleFetchAppointments,
    handleUpdateAppointmentStatus,
    handleBulkUpdateAppointmentStatus
};