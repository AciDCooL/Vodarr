# IPTV VOD Downloader (Web Version)

A modern, web-based desktop application for browsing and downloading VOD content from IPTV providers compatible with the Xtream Codes API. This version is designed to run headless in Docker or as a local web service.

## Key Features
- **Modern Web UI:** Built with React (TypeScript), TailwindCSS, and Lucide icons.
- **Headless Operation:** Designed to run in Docker containers on NAS (Synology, Unraid), servers, or locally.
- **Real-Time Monitoring:** 
    - Real-time download speed indicators.
    - Rich progress bars (Downloaded / Total Size).
    - Transient error tracking and timeline visualization.
- **Smart Downloader:** 
    - Sequential download queue with persistence.
    - Automatic retries for transient stream hiccups.
    - Stall detection (>2s chunks).
    - Resumable downloads (supports Byte-Range requests).
- **Advanced Navigation:** Category filtering with instant updates and scrollable lists for large catalogs.
- **Identity Spoofing:** Choose between various User-Agents (Chrome, TiviMate, VLC, etc.) to ensure provider compatibility.

## Deployment

### Docker (Recommended)
The easiest way to run the application is using Docker Compose.

1. **Clone the repository and switch to the web branch:**
   ```bash
   git checkout web-version
   ```
2. **Build and start:**
   ```bash
   docker-compose up -d --build
   ```
3. **Access the UI:** Open `http://localhost:6767`

### Local Setup
1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
2. **Run Headless:**
   ```bash
   python main.py --headless --port 6767
   ```

## Configuration

The application can be configured via the Web UI or via environment variables in Docker:

| Variable | Description | Default |
|----------|-------------|---------|
| `IPTV_PORT` | Web server port | `6767` |
| `IPTV_BASE_URL` | IPTV Provider URL | `""` |
| `IPTV_USERNAME` | IPTV Username | `""` |
| `IPTV_PASSWORD` | IPTV Password | `""` |
| `IPTV_DOWNLOAD_DIR` | Download destination | `/downloads` |
| `IPTV_CONFIG_DIR` | Persistent state storage | `/config` |

## Technical Architecture
- **Backend:** FastAPI (Python 3.11+) handles the REST API and coordinates the multi-threaded download manager.
- **Frontend:** React 18 with Vite, utilizing asynchronous polling for real-time state updates.
- **Container:** Multi-stage Docker build resulting in a slim, production-ready image.

## Modular Structure
The project is organized into logical modules:
- `api.py`: Xtream Codes API client.
- `downloader.py`: Core download logic and worker thread.
- `web.py`: FastAPI routes and web-specific state management.
- `config.py`: Persistent configuration and state handling.
# Triggering automated deployment retry
