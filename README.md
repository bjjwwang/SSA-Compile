# SSA-Compile: Zeabur Backend & Server Helper

This project consists of two parts: a backend deployed on Zeabur with a web interface, and a server-side helper that polls and downloads files.

## 1. Zeabur Backend (`zeabur-backend/`)
This is the main interface. It provides a file upload UI and an API for the helper.

### Features
- Web UI to upload files.
- Status indicator: **Connected with Docker Engine Server** (Green) when the helper is active.
- Password-protected API.

### Deployment to Zeabur
1. Create a new project on Zeabur.
2. Deploy the `zeabur-backend/` directory (it contains a `Dockerfile`).
3. Set the environment variable `AUTH_PASSWORD` in Zeabur (default is `secret123`).

---

## 2. Server Helper (`server-helper/`)
This script runs on your local machine or another server. It "pairs" with the Zeabur backend.

### Features
- Periodically sends heartbeats to the Zeabur backend.
- Polls for new uploaded files and downloads them to the `downloads/` directory.
- Deletes files from the Zeabur backend after successful download to save space.

### How to Run
1. Navigate to the directory: `cd server-helper`
2. Install dependencies: `npm install`
3. Start the helper by providing the Zeabur URL and password:
   ```bash
   ZEABUR_URL=https://your-zeabur-app.zeabur.app AUTH_PASSWORD=secret123 node helper.js
   ```

## Startup Order
1. Start the **Zeabur Backend** first.
2. Once the backend is live, start the **Server Helper**. The web interface on Zeabur should then show a green light.

