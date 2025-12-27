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
        cb(null, Date.now() + '-' + file.originalname);
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

// Upload endpoint (for anyone or UI)
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log(`File uploaded: ${req.file.filename}`);
    res.json({ message: 'File uploaded successfully', filename: req.file.filename });
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

