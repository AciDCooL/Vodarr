"""
FastAPI Web Server for IPTV VOD Downloader.
This module provides the REST API for browsing catalogs and managing the download queue.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .api import IPTVClient, APIError
from .config import AppConfig, ConfigManager, QueueStateManager, COMMON_USER_AGENTS
from .downloader import DownloadItem, DownloadManager
from .cache import CacheManager

logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Vodarr API")

# --- Global State Management ---
# config_manager handles loading/saving settings to config.json
config_manager = ConfigManager()
# queue_state_manager handles the persistent queue state
queue_state_manager = QueueStateManager()
# cache_manager handles SQLite caching of VOD lists
cache_manager = CacheManager()
# Global client and manager instances
client: Optional[IPTVClient] = None
download_manager: Optional[DownloadManager] = None

# In-memory mirror of the queue for fast API access
# Key: queue_id (uuid), Value: Dict representation of the DownloadItem
queue_items: Dict[str, Dict[str, Any]] = {}

def get_items_from_provider(kind: str, category_id: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Fetches items from provider with SQLite caching and normalization."""
    conf = config_manager.config
    
    if not force_refresh:
        cached = cache_manager.get_items(kind, category_id, conf.cache_expiry_hours)
        if cached is not None:
            return cached
            
    c = get_client()
    if kind == "movies":
        raw_items = c.get_vod_streams(category_id=category_id)
        # Normalize: ensure "cover" field exists (mapped from stream_icon)
        items = []
        for item in raw_items:
            if "stream_icon" in item and "cover" not in item:
                item["cover"] = item["stream_icon"]
            items.append(item)
    elif kind == "series":
        raw_items = c.get_series(category_id=category_id)
        # Normalize series if needed (though usually they have "cover")
        items = []
        for item in raw_items:
            if "last_modified" in item: # Common in series payload
                pass
            items.append(item)
    else:
        raise HTTPException(status_code=400, detail="Invalid kind")
        
    cache_manager.set_items(kind, category_id, items)
    return items

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

_last_save_time = 0.0
SAVE_INTERVAL = 5.0  # Save to disk at most every 5 seconds for progress updates

def on_download_update(item: DownloadItem):
    """
    Callback triggered by DownloadManager whenever a download status, 
    progress, or speed changes.
    """
    global _last_save_time
    queue_items[item.queue_id] = item.as_dict()
    
    # Force save on status change, otherwise throttle
    now = time.time()
    should_save = False
    
    if item.status in {"completed", "failed", "stopped", "removed", "cancelled"}:
        should_save = True
    elif now - _last_save_time > SAVE_INTERVAL:
        should_save = True
        
    if should_save:
        save_queue_state()
        _last_save_time = now

def save_queue_state():
    """Serializes the current non-deleted queue items to queue_state.json."""
    items = [
        item for item in queue_items.values() 
        if item.get("status") not in {"removed", "cancelled"}
    ]
    queue_state_manager.save_items(items)

def build_item_url(item: DownloadItem) -> str:
    """Rebuilds the stream URL using the LATEST credentials from config."""
    conf = config_manager.config
    base = conf.base_url.rstrip("/")
    ext = item.meta.get("original_extension", "mp4")
    
    # If the URL was already rotated to a fallback during retry, preserve that format
    if item.stream_url:
        current_ext = item.stream_url.split(".")[-1]
        if len(current_ext) <= 4:
            ext = current_ext

    if item.kind == "movie":
        return f"{base}/movie/{conf.username}/{conf.password}/{item.item_id}.{ext}"
    else:
        return f"{base}/series/{conf.username}/{conf.password}/{item.item_id}.{ext}"

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
            user_agent=conf.user_agent,
            auto_retry=conf.auto_retry_failed,
            max_retries=conf.max_retries,
            retry_forever=conf.retry_forever,
            retry_start_hour=conf.retry_start_hour,
            retry_end_hour=conf.retry_end_hour,
            url_builder=build_item_url
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
                # Force a URL refresh for restored items to ensure creds match
                try:
                    item.stream_url = build_item_url(item)
                except Exception:
                    pass
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
    cache_expiry_hours: Optional[int] = None
    auto_retry_failed: Optional[bool] = None
    max_retries: Optional[int] = None
    retry_forever: Optional[bool] = None
    retry_start_hour: Optional[int] = None
    retry_end_hour: Optional[int] = None

class QueueAddRequest(BaseModel):
    """Payload for adding one or more items to the download queue."""
    items: List[Dict[str, Any]]

# --- API Endpoints ---

@app.get("/api/config")
async def get_config():
    """Returns the current application configuration."""
    from dataclasses import asdict
    data = asdict(config_manager.config)
    data["is_complete"] = config_manager.config.is_complete()
    return data

@app.post("/api/config")
async def update_config(update: ConfigUpdate):
    """Updates configuration and signals the downloader to update its settings."""
    config_manager.update(**update.dict(exclude_unset=True))
    conf = config_manager.config
    if download_manager:
        download_manager.update_user_agent(conf.user_agent)
        download_manager.update_retry_settings(
            conf.auto_retry_failed, 
            conf.max_retries,
            conf.retry_forever,
            conf.retry_start_hour,
            conf.retry_end_hour
        )
    
    from dataclasses import asdict
    data = asdict(conf)
    data["is_complete"] = conf.is_complete()
    return data

@app.get("/api/common-user-agents")
async def get_ua_presets():
    """Returns the list of predefined User-Agent strings."""
    return COMMON_USER_AGENTS

@app.get("/api/browse-folders")
async def browse_folders(path: Optional[str] = None):
    """Lists subdirectories for a given path to help the user choose a download folder."""
    if not path:
        path = "/"
    
    p = Path(path)
    if not p.exists() or not p.is_dir():
        # Fallback to root if path is invalid
        p = Path("/")
    
    folders = []
    try:
        # Include parent directory if not at root
        if p != p.parent:
            folders.append({
                "name": "..",
                "path": str(p.parent),
                "is_parent": True
            })

        # List subdirectories, skipping hidden ones
        for item in sorted(p.iterdir()):
            if item.is_dir() and not item.name.startswith("."):
                folders.append({
                    "name": item.name,
                    "path": str(item.absolute()),
                    "is_parent": False
                })
    except Exception as e:
        logger.error(f"Failed to list directory {path}: {e}")
        # Return empty list or error
    
    return {
        "current_path": str(p.absolute()),
        "folders": folders
    }

@app.get("/api/test-connection")
async def test_connection():
    """Tests the connection to the IPTV provider API."""
    try:
        c = get_client()
        c.check_connection()
        return {"status": "success", "message": "Connection successful"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/system/restart")
async def restart_system():
    """Restarts the application by exiting the process (Kubernetes will restart the container)."""
    logger.info("Restart requested by user...")
    # Schedule exit after a short delay to allow response to reach client
    async def shutdown():
        await asyncio.sleep(1)
        os._exit(0)
    asyncio.create_task(shutdown())
    return {"message": "Restarting..."}

@app.post("/api/system/shutdown")
async def shutdown_system():
    """Shuts down the application process."""
    logger.info("Shutdown requested by user...")
    async def shutdown():
        await asyncio.sleep(1)
        os._exit(0)
    asyncio.create_task(shutdown())
    return {"message": "Shutting down..."}

@app.get("/api/categories/{kind}")
async def get_categories(kind: str, refresh: bool = False):
    """Fetches VOD or Series categories from the provider with caching."""
    conf = config_manager.config
    try:
        if not refresh:
            cached = cache_manager.get_categories(kind, conf.cache_expiry_hours)
            if cached is not None:
                return cached

        c = get_client()
        if kind == "movies":
            cats = c.get_vod_categories()
        elif kind == "series":
            cats = c.get_series_categories()
        else:
            raise HTTPException(status_code=400, detail="Invalid kind")
        
        cache_manager.set_categories(kind, cats)
        return cats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/items/{kind}/{category_id}")
async def get_items(kind: str, category_id: str, search: Optional[str] = None, offset: int = 0, limit: int = 50, refresh: bool = False):
    """Fetches items (Movies or Series) for a specific category with search, pagination and optional refresh."""
    try:
        all_items = get_items_from_provider(kind, category_id, force_refresh=refresh)
        
        # Apply search filter
        if search:
            search_query = search.lower()
            filtered_items = [i for i in all_items if search_query in i.get("name", "").lower()]
        else:
            filtered_items = all_items
            
        total = len(filtered_items)
        paginated = filtered_items[offset : offset + limit]
        
        return {
            "total": total,
            "items": paginated,
            "offset": offset,
            "limit": limit
        }
    except Exception as e:
        logger.exception("Failed to fetch items")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/series/{series_id}")
async def get_series_info(series_id: string):
    """Fetches detailed episode information for a specific TV Series."""
    c = get_client()
    try:
        return c.get_series_info(series_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/movie/{stream_id}")
async def get_movie_info(stream_id: str):
    """Fetches detailed information for a specific movie."""
    c = get_client()
    try:
        return c.get_vod_info(stream_id)
    except HTTPException:
        raise
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
        # Extract original extension for dynamic URL building
        stream_url = data["stream_url"]
        original_ext = stream_url.split(".")[-1] if "." in stream_url else "mp4"
        if len(original_ext) > 4: original_ext = "mp4" # Sanity check
        
        meta = data.get("meta", {})
        meta["original_extension"] = original_ext
        
        item = DownloadItem(
            item_id=str(data["item_id"]),
            title=data["title"],
            stream_url=stream_url,
            target_path=Path(data["target_path"]),
            kind=data.get("kind", "movie"),
            meta=meta
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
    elif action == "clear-all":
        download_manager.stop_all()
        queue_items.clear()
        save_queue_state()
    elif action == "restart-failed":
        failed_items = [item for item in queue_items.values() if item.get("status") == "failed"]
        for item_data in failed_items:
            queue_id = item_data["queue_id"]
            # Re-create DownloadItem object to pass to manager
            item = DownloadItem(
                item_id=str(item_data["item_id"]),
                title=item_data["title"],
                stream_url=item_data["stream_url"],
                target_path=Path(item_data["target_path"]),
                kind=item_data.get("kind", "movie"),
                meta=item_data.get("meta", {}),
                queue_id=queue_id
            )
            download_manager.restart_item(item)
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    return {"status": "success"}

@app.post("/api/queue/restart/{queue_id}")
async def restart_item(queue_id: str):
    """Restarts a failed or stopped download."""
    if not download_manager:
        raise HTTPException(status_code=500, detail="Downloader not initialized")
    
    item_data = queue_items.get(queue_id)
    if not item_data:
        raise HTTPException(status_code=404, detail="Item not found")
    
    item = DownloadItem(
        item_id=str(item_data["item_id"]),
        title=item_data["title"],
        stream_url=item_data["stream_url"],
        target_path=Path(item_data["target_path"]),
        kind=item_data.get("kind", "movie"),
        meta=item_data.get("meta", {}),
        queue_id=queue_id
    )
    download_manager.restart_item(item)
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
