# IPTV VOD Downloader (Web Version)

This is a headless, web-based version of the IPTV VOD Downloader, designed to run in a Docker container.

## Features
- **Web UI:** Modern React-based interface.
- **Headless:** Runs without a GUI, perfect for servers/NAS.
- **Dockerized:** Easy deployment with Docker and Docker Compose.
- **API-First:** Full REST API for all downloader functions.
- **Real-time Monitoring:** Speed, progress, and error tracking in the browser.

## Quick Start (Docker Compose)

1. **Configure:** Edit `docker-compose.yml` to set your IPTV credentials (optional, can be done in UI).
2. **Run:**
   ```bash
   docker-compose up -d --build
   ```
3. **Access:** Open `http://localhost:6767` in your browser.

## Configuration (Environment Variables)

| Variable | Description | Default |
|----------|-------------|---------|
| `IPTV_PORT` | Web server port | `6767` |
| `IPTV_BASE_URL` | IPTV Provider URL | `""` |
| `IPTV_USERNAME` | IPTV Username | `""` |
| `IPTV_PASSWORD` | IPTV Password | `""` |
| `IPTV_DOWNLOAD_DIR` | Download destination | `/downloads` |
| `IPTV_CONFIG_DIR` | Persistent state storage | `/config` |

## Local Development

### Backend (FastAPI)
```bash
pip install -r requirements.txt
python main.py --headless --port 6767
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
The frontend dev server proxies API calls to `localhost:6767`.

## Project Structure
- `iptv_vod_downloader/web.py`: FastAPI application and API routes.
- `frontend/`: React source code.
- `Dockerfile`: Multi-stage build (builds React, then packages Python).
- `main.py`: Entry point with `--headless` support.
