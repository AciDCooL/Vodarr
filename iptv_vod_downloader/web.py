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
from typing import Any, Dict, List, Optional, Union
import datetime
import ipaddress
import secrets

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends, status
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext

from .api import IPTVClient, APIError
from .config import AppConfig, COMMON_USER_AGENTS
from .downloader import DownloadItem, DownloadManager
from .cache import DatabaseManager

logger = logging.getLogger(__name__)

# --- Authentication Logic ---
pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)
api_key_header = APIKeyHeader(name="X-Api-Key", auto_error=False)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 24 hours

class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    username: str
    password: str

class AuthStatus(BaseModel):
    is_authenticated: bool
    username: Optional[str] = None
    bypass_active: bool = False

# --- API Models ---
app = FastAPI(title="Vodarr API")

# --- Global State Management ---
# unified database manager for cache, config, and queue
db = DatabaseManager()

# Global client and manager instances
client: Optional[IPTVClient] = None
download_manager: Optional[DownloadManager] = None

# Current config instance
current_config = AppConfig()

def is_local_request(request: Request) -> bool:
    """Checks if the request originates from a local IP address."""
    try:
        # Use X-Forwarded-For if behind a proxy like Traefik
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_host = forwarded.split(",")[0].strip()
        else:
            client_host = request.client.host if request.client else "127.0.0.1"
            
        # Handle cases like "::1"
        if client_host == "::1":
            return True
        ip = ipaddress.ip_address(client_host)
        return ip.is_loopback or ip.is_private
    except:
        return False

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.utcnow() + expires_delta
    else:
        expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, current_config.secret_key, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(request: Request, token: str = Depends(oauth2_scheme), api_key: str = Depends(api_key_header)):
    # 1. Check local bypass
    if current_config.auth_bypass_local and is_local_request(request):
        return current_config.admin_username

    # 2. Check API Key (X-Api-Key header)
    if api_key and current_config.api_key and api_key == current_config.api_key:
        return current_config.admin_username

    # 3. If no password set, auth is disabled (initial setup state)
    if not current_config.admin_password_hash:
        return "admin"

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # 4. Check JWT Token
    if token:
        try:
            payload = jwt.decode(token, current_config.secret_key, algorithms=[ALGORITHM])
            username: str = payload.get("sub")
            if username == current_config.admin_username:
                return username
        except JWTError:
            pass
            
    raise credentials_exception

def load_app_config():
    """Loads configuration from database and merges with environment defaults."""
    global current_config
    stored = db.get_config()
    
    # Merge env and stored
    from dataclasses import asdict
    conf_obj = AppConfig()
    if stored:
        valid_keys = asdict(conf_obj).keys()
        for k, v in stored.items():
            if k in valid_keys:
                setattr(conf_obj, k, v)
    
    # AUTO-GENERATE API KEY IF MISSING
    if not conf_obj.api_key:
        conf_obj.api_key = secrets.token_hex(32)
        db.save_config({"api_key": conf_obj.api_key})
        
    current_config = conf_obj

# Initial load
load_app_config()

# In-memory mirror of the queue for fast API access
queue_items: Dict[str, Dict[str, Any]] = {}

def get_items_from_provider(kind: str, category_id: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Fetches items from provider with SQLite caching and normalization."""
    conf = current_config
    
    if not force_refresh:
        cached = db.get_items(kind, category_id, conf.cache_expiry_hours)
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
        
    db.set_items(kind, category_id, items)
    return items

def get_client() -> IPTVClient:
    """
    Lazy initialization/refresh of the IPTV API client.
    Ensures the client always uses the latest credentials from config.
    """
    global client
    conf = current_config
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

def on_download_update(item_or_signal: Union[DownloadItem, str]):
    """
    Callback triggered by DownloadManager whenever a download status, 
    progress, or speed changes, or when a system signal is sent.
    """
    global _last_save_time
    global queue_items

    if isinstance(item_or_signal, str):
        if item_or_signal == "trigger-queue-retry":
            logger.info("Triggering full queue retry of all failed items...")
            failed_items = []
            for qid, item_dict in queue_items.items():
                if item_dict.get("status") == "failed":
                    # Convert back to DownloadItem
                    item = DownloadItem(
                        queue_id=item_dict["queue_id"],
                        item_id=item_dict["item_id"],
                        title=item_dict["title"],
                        stream_url=item_dict["stream_url"],
                        target_path=Path(item_dict["target_path"]),
                        kind=item_dict["kind"],
                        meta=item_dict.get("meta", {}),
                        total_size=item_dict["total_size"]
                    )
                    item.status = "queued"
                    item.error = None
                    item.retries = 0
                    failed_items.append(item)
                    queue_items[qid] = item.as_dict()
            
            if failed_items and download_manager:
                download_manager.add_items(failed_items)
                save_queue_state()
        elif item_or_signal == "trigger-stream-limit-reached":
            current_config.is_stream_limit_reached = True
        elif item_or_signal == "trigger-stream-limit-cleared":
            current_config.is_stream_limit_reached = False
        return

    item = item_or_signal
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
    """Serializes the current non-deleted queue items to the database."""
    items = [
        item for item in queue_items.values() 
        if item.get("status") not in {"removed", "cancelled"}
    ]
    db.save_queue(items)

def build_item_url(item: DownloadItem) -> str:
    """Rebuilds the stream URL using the LATEST credentials from config."""
    conf = current_config
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
    Initializes the DownloadManager and restores the queue from database
    upon application startup.
    """
    global download_manager
    conf = current_config
    if download_manager is None:
        download_manager = DownloadManager(
            callback=on_download_update,
            user_agent=conf.user_agent,
            auto_retry=conf.auto_retry_failed,
            max_retries=conf.max_retries,
            queue_retry_limit=conf.auto_retry_queue_limit,
            check_stream_limit=conf.check_stream_limit,
            stream_limit_check_interval=conf.stream_limit_check_interval,
            enable_download_window=conf.enable_download_window,
            retry_start_hour=conf.retry_start_hour,
            retry_end_hour=conf.retry_end_hour,
            connect_timeout=conf.connect_timeout,
            read_timeout=conf.read_timeout,
            url_builder=build_item_url,
            account_checker=get_account_info
        )
        
        # Restore queue from database
        for item_data in db.get_queue():
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
    auto_retry_queue_limit: Optional[int] = None
    enable_download_window: Optional[bool] = None
    retry_start_hour: Optional[int] = None
    retry_end_hour: Optional[int] = None
    connect_timeout: Optional[int] = None
    read_timeout: Optional[int] = None
    media_management: Optional[bool] = None
    debug_mode: Optional[bool] = None
    
    # Stream Limit
    check_stream_limit: Optional[bool] = None
    stream_limit_check_interval: Optional[int] = None

    # Auth
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None
    auth_bypass_local: Optional[bool] = None
    api_key: Optional[str] = None

class QueueAddRequest(BaseModel):
    """Payload for adding one or more items to the download queue."""
    items: List[Dict[str, Any]]

class ReorderRequest(BaseModel):
    """Payload for reordering the queue."""
    queue_ids: List[str]

# --- API Endpoints ---

@app.get("/api/config")
async def get_config(user: str = Depends(get_current_user)):
    """Returns the current application configuration."""
    from dataclasses import asdict
    data = asdict(current_config)
    data["is_complete"] = current_config.is_complete()
    
    # Check if download window is currently open
    is_in_window = True
    if download_manager:
        is_in_window = download_manager._is_in_download_window()
    data["is_in_window"] = is_in_window
    
    # Mask sensitive data
    data.pop("admin_password_hash", None)
    data.pop("secret_key", None)
    
    return data

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    if not current_config.admin_password_hash:
        # If password hash is empty, it means we're in setup mode.
        # But we don't want to allow login until it's set.
        raise HTTPException(status_code=400, detail="Authentication not setup")
        
    if request.username != current_config.admin_username or not verify_password(request.password, current_config.admin_password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    access_token_expires = datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": request.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/status")
async def auth_status(request: Request, token: str = Depends(oauth2_scheme)):
    bypass = current_config.auth_bypass_local and is_local_request(request)
    
    if bypass:
        return AuthStatus(is_authenticated=True, username=current_config.admin_username, bypass_active=True)
        
    if not current_config.admin_password_hash:
        # No password set yet -> in Setup Wizard / Open mode
        return AuthStatus(is_authenticated=True, username="admin", bypass_active=False)

    if not token:
        return AuthStatus(is_authenticated=False)
        
    try:
        payload = jwt.decode(token, current_config.secret_key, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username == current_config.admin_username:
            return AuthStatus(is_authenticated=True, username=username, bypass_active=False)
    except:
        pass
        
    return AuthStatus(is_authenticated=False)

@app.post("/api/config")
async def update_config(update: ConfigUpdate, user: str = Depends(get_current_user)):
    """Updates configuration and signals the downloader to update its settings."""
    global current_config
    from dataclasses import asdict
    conf = current_config
    
    # 1. Extract updates from model
    update_data = update.model_dump(exclude_unset=True)
    
    if current_config.debug_mode:
        # Log update data but mask password
        log_data = update_data.copy()
        if "admin_password" in log_data:
            log_data["admin_password"] = "********"
        logger.debug(f"Config update request: {log_data}")
    
    # 2. Handle password hashing separately
    if "admin_password" in update_data:
        pw = update_data.pop("admin_password")
        # Only hash if a new password was actually provided (not empty)
        if pw and pw.strip():
            logger.info("Updating admin password...")
            # Truncate to 72 bytes for bcrypt compatibility just in case
            update_data["admin_password_hash"] = get_password_hash(pw[:72])
    
    # 3. Filter only valid AppConfig keys before saving to DB or applying to object
    valid_keys = asdict(AppConfig()).keys()
    filtered_updates = {k: v for k, v in update_data.items() if k in valid_keys}
    
    if filtered_updates:
        # Persist filtered updates to database
        db.save_config(filtered_updates)
        
        # Update runtime object
        data = asdict(current_config)
        data.update(filtered_updates)
        current_config = AppConfig(**data)
        
        # Update dynamic log level if debug_mode changed
        if "debug_mode" in filtered_updates:
            is_debug = filtered_updates["debug_mode"]
            new_level = logging.DEBUG if is_debug else logging.INFO
            logging.getLogger().setLevel(new_level)
            
            # Also update noisy third-party loggers
            third_party_level = logging.DEBUG if is_debug else logging.WARNING
            logging.getLogger("uvicorn.access").setLevel(third_party_level)
            logging.getLogger("requests").setLevel(third_party_level)
            logging.getLogger("urllib3").setLevel(third_party_level)
            
            logger.info(f"Log level switched to {'DEBUG' if is_debug else 'INFO'}")
    
    # 4. Sync settings to manager
    conf = current_config
    if download_manager:
        download_manager.update_user_agent(conf.user_agent)
        download_manager.update_retry_settings(
            conf.auto_retry_failed, 
            conf.max_retries,
            conf.retry_start_hour,
            conf.retry_end_hour,
            conf.enable_download_window,
            conf.auto_retry_queue_limit
        )
        download_manager.update_timeout_settings(conf.connect_timeout, conf.read_timeout)
        download_manager.update_stream_limit_settings(conf.check_stream_limit, conf.stream_limit_check_interval)
    
    resp_data = asdict(conf)
    resp_data["is_complete"] = conf.is_complete()
    # Mask sensitive data
    resp_data.pop("admin_password_hash", None)
    resp_data.pop("secret_key", None)
    return resp_data

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

@app.get("/api/account")
async def get_account_info():
    """Returns vital account information (expiration, connections, formats)."""
    try:
        c = get_client()
        return c.check_connection()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
    conf = current_config
    try:
        if not refresh:
            cached = db.get_categories(kind, conf.cache_expiry_hours)
            if cached is not None:
                return cached

        c = get_client()
        if kind == "movies":
            cats = c.get_vod_categories()
        elif kind == "series":
            cats = c.get_series_categories()
        else:
            raise HTTPException(status_code=400, detail="Invalid kind")
        
        db.set_categories(kind, cats)
        return cats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/items/{kind}/{category_id}")
async def get_items(kind: str, category_id: str, search: Optional[str] = None, offset: int = 0, limit: int = 50, refresh: bool = False):
    """Fetches items (Movies or Series) for a specific category with search, pagination and optional refresh."""
    try:
        conf = current_config
        is_cached = False
        if not refresh:
            is_cached = db.is_cached(kind, category_id, conf.cache_expiry_hours)

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
            "limit": limit,
            "is_cached": is_cached
        }
    except Exception as e:
        logger.exception("Failed to fetch items")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/series/{series_id}")
async def get_series_info(series_id: str):
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
        item_id = str(data.get("item_id", ""))
        kind = data.get("kind", "movie")
        stream_url = data.get("stream_url", "")
        title = data.get("title", "Untitled")
        target_path = data.get("target_path", "")
        meta = data.get("meta", {})

        if not stream_url or not target_path:
            continue

        # --- MEDIA MANAGEMENT REORGANIZATION ---
        if current_config.media_management:
            tp = Path(target_path)
            ext = tp.suffix
            
            if kind == "movie":
                # Movie logic: /Downloads/Movies/Title (Year)/Title (Year).ext
                year = meta.get("year") or meta.get("display_year")
                year_suffix = f" ({year})" if year else ""
                folder_name = f"{title}{year_suffix}"
                # Construct path relative to the Movies root
                # Assumes target_path originally looks like .../Movies/Title.ext
                # We climb up one level to get the 'Movies' root
                root = tp.parent
                target_path = str(root / folder_name / f"{folder_name}{ext}")
            
            elif kind == "episode":
                # TV logic: /Downloads/TV/Series Title/Season XX/Series Title - SxxExx - Episode Title.ext
                series_title = meta.get("series_name", "Unknown Series")
                season_num = meta.get("season_num", 1)
                episode_num = meta.get("episode_num", 1)
                episode_title = meta.get("episode_title") or title
                
                # Sanitize titles
                series_title = series_title.strip()
                
                season_folder = f"Season {int(season_num):02d}"
                filename = f"{series_title} - S{int(season_num):02d}E{int(episode_num):02d} - {episode_title}{ext}"
                
                # Assumes target_path originally looks like .../TV/Series Title/filename
                # We want to insert the Season folder
                root = tp.parent.parent # The 'TV' folder
                target_path = str(root / series_title / season_folder / filename)

        # Try to get file size via HEAD request if not already provided
        total_size = data.get("total_size", 0)
        if total_size <= 0:
            try:
                # Use a separate session for head check to avoid mixing headers
                with requests.head(stream_url, timeout=5, headers=build_headers(current_config.user_agent), allow_redirects=True) as r:
                    if r.status_code == 200:
                        total_size = int(r.headers.get("Content-Length", 0))
            except:
                pass

        item = DownloadItem(
            item_id=item_id,
            title=title,
            stream_url=stream_url,
            target_path=Path(target_path),
            kind=kind,
            meta=meta,
            total_size=total_size
        )
        new_items.append(item)
        queue_items[item.queue_id] = item.as_dict()
    
    download_manager.add_items(new_items)
    save_queue_state()
    return {"status": "success", "added": len(new_items)}

@app.post("/api/queue/reorder")
async def reorder_queue(request: ReorderRequest):
    """Reorders the items in the queue."""
    global queue_items
    if not download_manager:
        raise HTTPException(status_code=500, detail="Downloader not initialized")
    
    # Update the internal manager queue
    download_manager.reorder_queue(request.queue_ids)
    
    # Update the in-memory mirror to reflect the new order
    new_mirror = {}
    for qid in request.queue_ids:
        if qid in queue_items:
            new_mirror[qid] = queue_items[qid]
    
    # Add back any completed/failed items that weren't in the reorder request
    for qid, item in queue_items.items():
        if qid not in new_mirror:
            new_mirror[qid] = item
            
    queue_items = new_mirror
    save_queue_state()
    return {"status": "success"}

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
