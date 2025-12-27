const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

// Configuration
const args = process.argv.slice(2);
const ZEABUR_URL = args[0] || process.env.ZEABUR_URL || 'http://localhost:8080';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'secret123';
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const POLL_INTERVAL = 5000; // 5 seconds

// Category to Container Path Mapping
const CATEGORY_MAP = {
    'Assignment-1': {
        path: '/home/SVF-tools/Software-Security-Analysis/Assignment-1/CPP/Assignment_1.cpp',
        test: 'ctest -R ass1'
    },
    'Assignment-2': {
        path: '/home/SVF-tools/Software-Security-Analysis/Assignment-2/CPP/Assignment_2.cpp',
        test: 'ctest -R ass2'
    },
    'Assignment-3': {
        path: '/home/SVF-tools/Software-Security-Analysis/Assignment-3/CPP/Assignment_3.cpp',
        test: 'ctest -R ass3'
    },
    'Lab-1': {
        path: '/home/SVF-tools/Software-Security-Analysis/Lab-Exercise-1/CPP/GraphAlgorithm.cpp',
        test: 'ctest -R lab1'
    },
    'Lab-2': {
        path: '/home/SVF-tools/Software-Security-Analysis/Lab-Exercise-2/CPP/Z3Examples.cpp',
        test: 'ctest -R lab2'
    },
    'Lab-3': {
        path: '/home/SVF-tools/Software-Security-Analysis/Lab-Exercise-3/CPP/AEMgr.cpp',
        test: 'ctest -R lab3'
    }
};

// Task Queue State
let activeTasks = 0;
const MAX_CONCURRENT_TASKS = 5;
const pendingFiles = new Set(); // To avoid processing the same file multiple times if polling is fast

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

// Cleanup task for old downloaded files (older than 30 minutes)
const CLEANUP_INTERVAL = 10 * 60 * 1000; // Run every 10 minutes
const MAX_FILE_AGE = 30 * 60 * 1000; // 30 minutes

function cleanupOldFiles() {
    console.log('Running cleanup for old files in downloads...');
    fs.readdir(DOWNLOAD_DIR, (err, files) => {
        if (err) return console.error('Cleanup readdir error:', err);
        
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(DOWNLOAD_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > MAX_FILE_AGE) {
                    fs.unlink(filePath, (err) => {
                        if (!err) console.log(`Deleted old downloaded file: ${file}`);
                    });
                }
            });
        });
    });
}

setInterval(cleanupOldFiles, CLEANUP_INTERVAL);
cleanupOldFiles(); // Run once at start

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

        // 3. Launch Docker Container and Compile
        console.log(`Launching Docker for ${category}...`);
        const result = await runDockerTask(localPath, category);
        
        // 4. Send Result back to Zeabur
        await axios.post(`${ZEABUR_URL}/result/${filename}`, {
            result: result
        }, {
            headers: { 'x-auth-password': AUTH_PASSWORD }
        });
        
        console.log(`[Task Finished] Result sent to server for ${filename}`);

    } catch (error) {
        console.error(`Error processing ${filename}:`, error.message);
        // Try to send error to frontend if possible
        try {
            await axios.post(`${ZEABUR_URL}/result/${filename}`, {
                result: `System Error: ${error.message}`
            }, { headers: { 'x-auth-password': AUTH_PASSWORD } });
        } catch(e) {}
    } finally {
        activeTasks--;
        pendingFiles.delete(filename);
    }
}

/**
 * Executes the SVF Docker container with the uploaded file
 */
function runDockerTask(localPath, category) {
    const config = CATEGORY_MAP[category];
    if (!config) {
        return Promise.resolve(`Error: No mapping found for category ${category}`);
    }

    const targetInContainer = config.path;
    const testCmd = config.test;

    // All builds happen in /home/SVF-tools/Software-Security-Analysis
    const buildRoot = '/home/SVF-tools/Software-Security-Analysis';
    
    // Command sequence:
    // 1. Enter build root
    // 2. Run make (compile)
    // 3. IF make succeeds (&&), run the specific ctest
    const fullCommand = `cd ${buildRoot} && make && ${testCmd}`; 

    // Use sudo if configured in environment
    const sudoPrefix = process.env.USE_SUDO === 'true' ? 'sudo ' : '';
    
    // Docker command:
    // --rm: remove container after run
    // -v: mount local file to target path in container (read-only)
    const dockerCmd = `${sudoPrefix}docker run --rm -v "${localPath}:${targetInContainer}:ro" svftools/software-security-analysis:latest /bin/bash -c "${fullCommand}"`;

    return new Promise((resolve) => {
        console.log(`Running: ${dockerCmd}`);
        exec(dockerCmd, (error, stdout, stderr) => {
            let output = "";
            if (stdout) output += stdout;
            if (stderr) output += "\nError/Stderr:\n" + stderr;
            
            if (error) {
                // If it fails, output will contain why (compilation error or test failure)
                resolve(`Execution Failed (Compilation or Tests):\n${output}\n\nInternal Error: ${error.message}`);
            } else {
                resolve(`Execution Success:\n${output}`);
            }
        });
    });
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

