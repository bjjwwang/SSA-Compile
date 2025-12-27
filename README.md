# SSA-Compile: Zeabur Backend & Server Helper

This project consists of two parts: a backend deployed on Zeabur with a web interface, and a server-side helper that polls and downloads files.

## 快速启动 (Quick Start)

### 1. 启动 Zeabur 后端 (主控端)
```bash
cd zeabur-backend
npm install
npm run dev
```
- **访问地址**: `http://localhost:8080`
- **功能**: 提供上传界面，显示 Helper 是否在线。

### 2. 启动服务器助手 (辅助端)
打开另一个终端：
```bash
cd server-helper
npm install

# 权限建议：为了让 Helper 能运行 Docker，建议将当前用户加入 docker 组：
# sudo usermod -aG docker $USER (然后重启生效)

# 方式 A: 直接运行（推荐，如果已配置免 sudo）
npm run dev

# 方式 B: 使用 sudo 运行 (如果未配置免 sudo)
sudo USE_SUDO=true npm run dev
```
- **参数说明**: 
  - `ZEABUR_URL`: 目标后端的网址。
  - `AUTH_PASSWORD`: 约定的密码（默认 `secret123`）。
  - `USE_SUDO`: 是否在运行 Docker 时自动加 `sudo`。

---

## 部署到 Zeabur
1. 在 Zeabur 上创建一个新项目，并关联整个仓库。
2. Zeabur 会自动识别根目录下的 `Dockerfile`。
3. 在 Zeabur 变量设置中添加 `AUTH_PASSWORD`。
4. 获取 Zeabur 给出的域名（例如 `https://my-app.zeabur.app`）。
4. **服务器端配对**: 在你的服务器上启动助手时，指定该域名：
   ```bash
   ZEABUR_URL=https://my-app.zeabur.app AUTH_PASSWORD=你的密码 npm start
   ```

## Docker 说明
Helper 会自动拉取 `svftools/software-security-analysis:latest` 镜像，并根据前端选择的分类（Assignment/Lab）将文件挂载到容器内的指定路径：
- **Assignment-1**: `/home/SVF-tools/Software-Security-Analysis/Assignment-1/CPP/Assignment_1.cpp`
- **Lab-1**: `/home/SVF-tools/Software-Security-Analysis/Lab-Exercise-1/CPP/GraphAlgorithm.cpp`
- (以此类推...)

挂载后，Helper 会在对应目录下执行 `make` 命令，并将输出结果实时传回网页端。

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

