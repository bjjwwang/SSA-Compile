const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'secret123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting state
const lastUploads = new Map(); // IP -> timestamp
const UPLOAD_COOLDOWN = 3 * 60 * 1000; // 3 minutes

// Storage for uploaded files
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const category = req.body.category || 'unknown';
        // Format: category_timestamp-originalName
        cb(null, `${category}_${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Connection status tracking
let lastHeartbeat = 0;
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds

// Authentication middleware
const authenticate = (req, res, next) => {
    const password = req.headers['x-auth-password'] || req.query.password;
    if (password === AUTH_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// UI Status endpoint
app.get('/status', (req, res) => {
    const isConnected = (Date.now() - lastHeartbeat) < HEARTBEAT_TIMEOUT;
    res.json({ connected: isConnected });
});

// Heartbeat endpoint for server helper
app.post('/heartbeat', authenticate, (req, res) => {
    lastHeartbeat = Date.now();
    res.json({ status: 'ok' });
});

// Upload endpoint
app.post('/upload', (req, res, next) => {
    const userIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    
    if (lastUploads.has(userIp)) {
        const lastTime = lastUploads.get(userIp);
        const waitTime = lastTime + UPLOAD_COOLDOWN - now;
        if (waitTime > 0) {
            const minutes = Math.floor(waitTime / 60000);
            const seconds = Math.floor((waitTime % 60000) / 1000);
            return res.status(429).json({ 
                error: `Rate limit: Please wait ${minutes}m ${seconds}s before your next test.` 
            });
        }
    }
    
    // If passed, proceed to upload
    upload.single('file')(req, res, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const category = req.body.category;
        console.log(`File uploaded: ${req.file.filename} (Category: ${category}) from ${userIp}`);
        
        // Update rate limit timestamp
        lastUploads.set(userIp, now);
        
        res.json({ 
            message: 'File uploaded successfully', 
            filename: req.file.filename,
            category: category 
        });
    });
});

// Poll endpoint for server helper
app.get('/poll', authenticate, (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read uploads' });
        res.json({ files });
    });
});

// Download endpoint for server helper
app.get('/download/:filename', authenticate, (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (!err) {
                // Optionally delete after download
                // fs.unlinkSync(filePath);
            }
        });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Delete endpoint after helper successfully downloads
app.delete('/file/:filename', authenticate, (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ message: 'File deleted' });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Zeabur Backend running on port ${PORT}`);
});

