const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const ZEABUR_URL = process.env.ZEABUR_URL || 'http://localhost:3000';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'secret123';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const POLL_INTERVAL = 5000; // 5 seconds

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

console.log(`Starting Server Helper...`);
console.log(`Target Zeabur URL: ${ZEABUR_URL}`);

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

// Polling and downloading function
async function pollAndDownload() {
    try {
        const response = await axios.get(`${ZEABUR_URL}/poll`, {
            headers: { 'x-auth-password': AUTH_PASSWORD }
        });
        const files = response.data.files;

        for (const filename of files) {
            console.log(`New file detected: ${filename}. Downloading...`);
            const fileUrl = `${ZEABUR_URL}/download/${filename}?password=${AUTH_PASSWORD}`;
            const localPath = path.join(DOWNLOAD_DIR, filename);
            
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

            console.log(`Downloaded ${filename} to ${localPath}`);

            // Delete from server after successful download
            await axios.delete(`${ZEABUR_URL}/file/${filename}`, {
                headers: { 'x-auth-password': AUTH_PASSWORD }
            });
            console.log(`Deleted ${filename} from Zeabur server.`);
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

