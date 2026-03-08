"""
FastAPI Web Server for IPTV VOD Downloader.
This module provides the REST API for browsing catalogs and managing the download queue.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .api import IPTVClient, APIError
from .config import AppConfig, ConfigManager, QueueStateManager, COMMON_USER_AGENTS
from .downloader import DownloadItem, DownloadManager

logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="IPTV VOD Downloader API")

# --- Global State Management ---
# config_manager handles loading/saving settings to config.json
config_manager = ConfigManager()
# queue_state_manager handles the persistent queue state
queue_state_manager = QueueStateManager()
# Global client and manager instances
client: Optional[IPTVClient] = None
download_manager: Optional[DownloadManager] = None

# In-memory mirror of the queue for fast API access
# Key: queue_id (uuid), Value: Dict representation of the DownloadItem
queue_items: Dict[str, Dict[str, Any]] = {}

def get_client() -> IPTVClient:
    """
    Lazy initialization/refresh of the IPTV API client.
    Ensures the client always uses the latest credentials from config.
    """
    global client
    conf = config_manager.config
    if not conf.is_complete():
        raise HTTPException(status_code=400, detail="Configuration is incomplete")
    
    # Re-create client if config changed
    if client is None or client.base_url != conf.base_url or client.username != conf.username:
        client = IPTVClient(
            conf.base_url,
            conf.username,
            conf.password,
            user_agent=conf.user_agent
        )
    return client

def on_download_update(item: DownloadItem):
    """
    Callback triggered by DownloadManager whenever a download status, 
    progress, or speed changes.
    """
    queue_items[item.queue_id] = item.as_dict()
    # Auto-save queue state to disk on every update
    save_queue_state()

def save_queue_state():
    """Serializes the current non-deleted queue items to queue_state.json."""
    items = [
        item for item in queue_items.values() 
        if item.get("status") not in {"removed", "cancelled"}
    ]
    queue_state_manager.save_items(items)

def init_downloader():
    """
    Initializes the DownloadManager and restores the queue from disk
    upon application startup.
    """
    global download_manager
    conf = config_manager.config
    if download_manager is None:
        download_manager = DownloadManager(
            callback=on_download_update,
            user_agent=conf.user_agent
        )
        
        # Restore queue from persistent storage
        for item_data in queue_state_manager.load_items():
            queue_id = item_data.get("queue_id")
            if not queue_id: continue
            queue_items[queue_id] = item_data
            
            # Re-queue items that were pending or active
            status = item_data.get("status")
            if status in {"queued", "downloading", "paused"}:
                item = DownloadItem(
                    item_id=str(item_data["item_id"]),
                    title=item_data["title"],
                    stream_url=item_data["stream_url"],
                    target_path=Path(item_data["target_path"]),
                    kind=item_data.get("kind", "movie"),
                    meta=item_data.get("meta", {}),
                    queue_id=queue_id
                )
                download_manager.add_items([item])
        
        download_manager.start()

@app.on_event("startup")
async def startup_event():
    """FastAPI startup hook."""
    init_downloader()

# --- Pydantic Models for API validation ---

class ConfigUpdate(BaseModel):
    """Payload for updating app configuration."""
    base_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    download_dir: Optional[str] = None
    user_agent: Optional[str] = None

class QueueAddRequest(BaseModel):
    """Payload for adding one or more items to the download queue."""
    items: List[Dict[str, Any]]

# --- API Endpoints ---

@app.get("/api/config")
async def get_config():
    """Returns the current application configuration."""
    return config_manager.config

@app.post("/api/config")
async def update_config(update: ConfigUpdate):
    """Updates configuration and signals the downloader to update its User-Agent."""
    config_manager.update(**update.dict(exclude_unset=True))
    if download_manager:
        download_manager.update_user_agent(config_manager.config.user_agent)
    return config_manager.config

@app.get("/api/common-user-agents")
async def get_ua_presets():
    """Returns the list of predefined User-Agent strings."""
    return COMMON_USER_AGENTS

@app.get("/api/test-connection")
async def test_connection():
    """Tests the connection to the IPTV provider API."""
    try:
        c = get_client()
        c.check_connection()
        return {"status": "success", "message": "Connection successful"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/categories/{kind}")
async def get_categories(kind: str):
    """Fetches VOD or Series categories from the provider."""
    c = get_client()
    try:
        if kind == "movies":
            return c.get_vod_categories()
        elif kind == "series":
            return c.get_series_categories()
        else:
            raise HTTPException(status_code=400, detail="Invalid kind")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/items/{kind}/{category_id}")
async def get_items(kind: str, category_id: str):
    """Fetches items (Movies or Series) for a specific category."""
    c = get_client()
    try:
        if kind == "movies":
            return c.get_vod_streams(category_id=category_id)
        elif kind == "series":
            return c.get_series(category_id=category_id)
        else:
            raise HTTPException(status_code=400, detail="Invalid kind")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/series/{series_id}")
async def get_series_info(series_id: str):
    """Fetches detailed episode information for a specific TV Series."""
    c = get_client()
    try:
        return c.get_series_info(series_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/queue")
async def get_queue():
    """Returns the current state of the download queue."""
    return list(queue_items.values())

@app.post("/api/queue/add")
async def add_to_queue(request: QueueAddRequest):
    """Adds new items to the download worker queue."""
    if not download_manager:
        raise HTTPException(status_code=500, detail="Downloader not initialized")
    
    new_items = []
    for data in request.items:
        item = DownloadItem(
            item_id=str(data["item_id"]),
            title=data["title"],
            stream_url=data["stream_url"],
            target_path=Path(data["target_path"]),
            kind=data.get("kind", "movie"),
            meta=data.get("meta", {})
        )
        new_items.append(item)
        queue_items[item.queue_id] = item.as_dict()
    
    download_manager.add_items(new_items)
    save_queue_state()
    return {"status": "success", "added": len(new_items)}

@app.post("/api/queue/control/{action}")
async def control_queue(action: str):
    """Controls global queue state (start, pause, stop, clear)."""
    if not download_manager:
        raise HTTPException(status_code=500, detail="Downloader not initialized")
    
    if action == "start":
        download_manager.start()
    elif action == "pause":
        download_manager.pause()
    elif action == "resume":
        download_manager.resume()
    elif action == "stop":
        download_manager.stop_all()
    elif action == "clear-completed":
        to_remove = [qid for qid, item in queue_items.items() if item.get("status") == "completed"]
        for qid in to_remove:
            queue_items.pop(qid, None)
        save_queue_state()
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    return {"status": "success"}

@app.delete("/api/queue/{queue_id}")
async def remove_from_queue(queue_id: str):
    """Removes a specific item from the queue."""
    if not download_manager:
        raise HTTPException(status_code=500, detail="Downloader not initialized")
    
    if download_manager.remove_item(queue_id):
        queue_items.pop(queue_id, None)
        save_queue_state()
        return {"status": "success"}
    else:
        # Check in local map if not found in active manager
        if queue_id in queue_items:
            queue_items.pop(queue_id, None)
            save_queue_state()
            return {"status": "success"}
        raise HTTPException(status_code=404, detail="Item not found")

# --- Static File Serving ---
# Serves the React frontend (Vite build output)
frontend_path = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
else:
    @app.get("/")
    async def index():
        return {"message": "Frontend not built. API is available at /api"}
