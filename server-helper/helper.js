const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const args = process.argv.slice(2);
const ZEABUR_URL = args[0] || process.env.ZEABUR_URL || 'http://localhost:3000';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'secret123';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const POLL_INTERVAL = 5000; // 5 seconds

// Task Queue State
let activeTasks = 0;
const MAX_CONCURRENT_TASKS = 5;
const pendingFiles = new Set(); // To avoid processing the same file multiple times if polling is fast

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

console.log(`Starting Server Helper...`);
console.log(`Target Zeabur URL: ${ZEABUR_URL}`);
console.log(`Max Concurrent Docker Tasks: ${MAX_CONCURRENT_TASKS}`);

// Heartbeat function
async function sendHeartbeat() {
    try {
        await axios.post(`${ZEABUR_URL}/heartbeat`, {}, {
            headers: { 'x-auth-password': AUTH_PASSWORD }
        });
        // console.log('Heartbeat sent');
    } catch (error) {
        console.error('Heartbeat failed:', error.message);
    }
}

// Single file processor
async function processFile(filename) {
    activeTasks++;
    try {
        // Parse filename to get info
        // Format: category_timestamp-originalName
        const parts = filename.split('_');
        const category = parts[0];
        const originalName = parts.slice(1).join('_').split('-').slice(1).join('-');

        console.log(`\n[Task Started] [Active: ${activeTasks}/${MAX_CONCURRENT_TASKS}] Category: ${category}, File: ${originalName}`);
        
        const fileUrl = `${ZEABUR_URL}/download/${filename}?password=${AUTH_PASSWORD}`;
        const localPath = path.join(DOWNLOAD_DIR, filename);
        
        // 1. Download
        console.log(`Downloading ${filename}...`);
        const writer = fs.createWriteStream(localPath);
        const downloadRes = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream'
        });

        downloadRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 2. Delete from server after successful download
        await axios.delete(`${ZEABUR_URL}/file/${filename}`, {
            headers: { 'x-auth-password': AUTH_PASSWORD }
        });
        console.log(`Downloaded and cleared from server: ${filename}`);

        // 3. TODO: Launch Docker Container here
        console.log(`Simulating Docker run for 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); 
        
        // 4. Send Result back to Zeabur
        const mockResult = `Compilation Successful for ${originalName}!\nCategory: ${category}\nOutput: [Mock SSA Code Block] ... done.`;
        await axios.post(`${ZEABUR_URL}/result/${filename}`, {
            result: mockResult
        }, {
            headers: { 'x-auth-password': AUTH_PASSWORD }
        });
        
        console.log(`[Task Finished] Result sent to server for ${filename}`);

    } catch (error) {
        console.error(`Error processing ${filename}:`, error.message);
    } finally {
        activeTasks--;
        pendingFiles.delete(filename);
    }
}

// Polling and downloading function
async function pollAndDownload() {
    if (activeTasks >= MAX_CONCURRENT_TASKS) {
        // console.log(`Worker busy (${activeTasks}/${MAX_CONCURRENT_TASKS}). Skipping poll.`);
        return;
    }

    try {
        const response = await axios.get(`${ZEABUR_URL}/poll`, {
            headers: { 'x-auth-password': AUTH_PASSWORD }
        });
        const files = response.data.files;

        for (const filename of files) {
            if (activeTasks >= MAX_CONCURRENT_TASKS) break;
            
            if (!pendingFiles.has(filename)) {
                pendingFiles.add(filename);
                processFile(filename); // Fire and forget (it manages its own state)
            }
        }
    } catch (error) {
        console.error('Polling error:', error.message);
    }
}

// Run heartbeats and polling
setInterval(sendHeartbeat, POLL_INTERVAL);
setInterval(pollAndDownload, POLL_INTERVAL);

// Initial run
sendHeartbeat();
pollAndDownload();

