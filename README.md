# 🚀 Vodarr

**Vodarr** is a modern, high-performance IPTV VOD downloader designed for the automation era. It transforms your IPTV provider's catalog into a clean, searchable interface with advanced queue management and full media server compatibility.

![License](https://img.shields.io/github/license/AciDCooL/Vodarr?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?style=for-the-badge&logo=docker)
![GitOps](https://img.shields.io/badge/GitOps-Enabled-green?style=for-the-badge&logo=argocd)

---

## ✨ Key Features

### ⚡ Smart Download Engine
- **Priority Preemption**: Reorder your queue via drag-and-drop to immediately pause the current download and start your new top priority.
- **Smart Resume**: Automatically detects and resumes from existing `.part` files using HTTP Range headers—never lose progress on a backend restart.
- **Concurrent Discovery**: Proactively performs `HEAD` requests to streams to discover file sizes and metadata before you even click download.
- **Dead Link Detection**: Configurable network timeouts allow the worker to zip through broken provider links in seconds.

### 📂 Media Management (Radarr/Sonarr Mode)
- **Radarr Compatible**: Automatically organizes movies into `Movies/Title (Year)/Title (Year).ext`.
- **Sonarr Compatible**: Handles series with precision: `TV/Series Title/Season XX/Series Title - SxxExx - Episode Title.ext`.
- **Naming Standards**: Uses industry-standard sanitization and naming patterns for perfect importing into Plex, Emby, or Jellyfin.

### 📊 Advanced Queue Control
- **Two-State Management**: Switch between a discreet footer monitor and a full-screen, maximized management dashboard.
- **Live Metrics**: Monitor individual speeds, global bandwidth usage, and accurate ETAs based on remaining bytes.
- **Bulk Operations**: One-click controls to Start, Pause, Stop, Retry Failures, Prune Completed, or Wipe the entire queue.

### 🛡️ Robust & Private
- **SQLite Persistence**: All settings, queue states, and catalog caches are stored in a single `vodarr.db` file—no more messy JSON files.
- **Download Window**: Enforce scheduled downloads (e.g., only between 02:00 and 08:00) to respect data caps or ISP throttling.
- **Safe Imaging**: Custom `SafeImage` component prevents parent-element errors and protects your privacy with `no-referrer` policies for movie covers.

---

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, Lucide Icons.
- **Backend**: Python 3.11, FastAPI, Uvicorn.
- **Storage**: SQLite 3 with `sqlite3` driver.
- **Deployment**: Docker (Multi-stage build), GitOps/ArgoCD ready.

---

## 🚀 Quick Start

### Docker Compose (Recommended)
```yaml
services:
  vodarr:
    image: ghcr.io/acidcool/vodarr:latest
    container_name: vodarr
    ports:
      - "6767:6767"
    volumes:
      - ./config:/config
      - /your/media/path:/downloads
    environment:
      - TZ=Europe/Amsterdam
    restart: unless-stopped
```

### Environment Variables
| Variable | Default | Description |
| :--- | :--- | :--- |
| `IPTV_MAX_RETRIES` | `3` | Global retry limit for failed downloads. |
| `IPTV_CONNECT_TIMEOUT` | `5` | Seconds to wait for server connection. |
| `IPTV_READ_TIMEOUT` | `10` | Seconds to wait for stream data chunks. |
| `IPTV_ENABLE_WINDOW` | `false` | Enable/Disable the download time window. |
| `IPTV_MEDIA_MANAGEMENT` | `false` | Enable Radarr/Sonarr folder structures. |

---

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit pull requests and report bugs.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

**Disclaimer**: This tool is for personal educational use only. Users are responsible for ensuring they have the rights to download any content retrieved via this application.
