"""Configuration helpers and persisted state for the IPTV VOD downloader."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List

# Docker-friendly defaults
def get_default_config_dir() -> Path:
    if os.path.exists("/config"):
        return Path("/config")
    return Path.home() / ".iptv_vod_downloader"

CONFIG_DIR = get_default_config_dir()
CONFIG_FILE = CONFIG_DIR / "config.json"
QUEUE_STATE_FILE = CONFIG_DIR / "queue_state.json"

@dataclass
class AppConfig:
    """Serializable application configuration."""

    base_url: str = os.getenv("IPTV_BASE_URL", "")
    username: str = os.getenv("IPTV_USERNAME", "")
    password: str = os.getenv("IPTV_PASSWORD", "")
    download_dir: str = os.getenv("IPTV_DOWNLOAD_DIR", "/downloads" if os.path.exists("/downloads") else str(Path.home() / "Downloads" / "IPTV-VOD"))
    user_agent: str = os.getenv("IPTV_USER_AGENT", (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/118.0.5993.70 Safari/537.36"
    ))
    web_port: int = int(os.getenv("IPTV_PORT", "6767"))
    cache_expiry_hours: int = int(os.getenv("IPTV_CACHE_EXPIRY", "24"))
    auto_retry_failed: bool = os.getenv("IPTV_AUTO_RETRY", "true").lower() == "true"
    max_retries: int = int(os.getenv("IPTV_MAX_RETRIES", "3"))
    enable_download_window: bool = os.getenv("IPTV_ENABLE_WINDOW", "false").lower() == "true"
    retry_start_hour: int = int(os.getenv("IPTV_RETRY_START", "4"))
    retry_end_hour: int = int(os.getenv("IPTV_RETRY_END", "9"))
    connect_timeout: int = int(os.getenv("IPTV_CONNECT_TIMEOUT", "5"))
    read_timeout: int = int(os.getenv("IPTV_READ_TIMEOUT", "10"))
    media_management: bool = os.getenv("IPTV_MEDIA_MANAGEMENT", "false").lower() == "true"
    debug_mode: bool = os.getenv("IPTV_DEBUG", "false").lower() == "true"
    
    # --- AUTHENTICATION ---
    admin_username: str = os.getenv("IPTV_ADMIN_USER", "admin")
    admin_password_hash: str = "" # Stored hashed in DB
    auth_bypass_local: bool = os.getenv("IPTV_AUTH_BYPASS_LOCAL", "true").lower() == "true"
    api_key: str = os.getenv("IPTV_API_KEY", "")
    secret_key: str = os.getenv("IPTV_SECRET_KEY", os.urandom(32).hex())

    def is_complete(self) -> bool:
        """Return True when the configuration looks usable."""
        return all(
            [
                self.base_url.strip(),
                self.username.strip(),
                self.password.strip(),
                self.download_dir.strip(),
            ]
        )


COMMON_USER_AGENTS = {
    "Chrome (Windows)": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/118.0.5993.70 Safari/537.36"
    ),
    "TiviMate": "TiviMate/5.0.0 (Linux; Android 11; M2012K11AG Build/RKQ1.201112.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36",
    "VLC": "VLC/3.0.18 LibVLC/3.0.18",
    "IPTVSmartersPro": "IPTVSmartersPro",
    "XCIPTV": "XCIPTV",
}


class ConfigManager:
    """Persist and retrieve :class:`AppConfig` instances."""

    def __init__(self, path: Path = CONFIG_FILE) -> None:
        self.path = path
        self._config = AppConfig()
        self.load()

    @property
    def config(self) -> AppConfig:
        return self._config

    def load(self) -> AppConfig:
        if not self.path.exists():
            # If file doesn't exist, we still have env defaults in self._config
            return self._config

        try:
            with self.path.open("r", encoding="utf-8") as fh:
                raw: Dict[str, Any] = json.load(fh)
        except (json.JSONDecodeError, OSError):
            return self._config

        # Filter out unknown keys to prevent TypeError on dataclass init
        valid_keys = asdict(AppConfig()).keys()
        filtered = {k: v for k, v in raw.items() if k in valid_keys}
        
        # Merge: File values override Env defaults, but Env vars (if set explicitly) 
        # should probably override file. For simplicity, let's just use file values
        # if they exist, but if they are empty strings and env has values, use env.
        
        current_data = asdict(self._config)
        for k, v in filtered.items():
            if v: # Only override if not empty in file
                current_data[k] = v
        
        self._config = AppConfig(**current_data)
        return self._config

    def save(self, config: AppConfig | None = None) -> None:
        if config is not None:
            self._config = config

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as fh:
            json.dump(asdict(self._config), fh, indent=2)

    def update(self, **kwargs: Any) -> AppConfig:
        data = asdict(self._config)
        valid_keys = data.keys()
        data.update({k: v for k, v in kwargs.items() if k in valid_keys and v is not None})
        self._config = AppConfig(**data)
        self.save()
        return self._config


class JSONStateManager:
    """Small JSON-backed state store."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def load(self, default: Any) -> Any:
        if not self.path.exists():
            return default
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            return default

    def save(self, payload: Any) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)


class QueueStateManager(JSONStateManager):
    """Persist visible queue entries between app launches."""

    def __init__(self, path: Path = QUEUE_STATE_FILE) -> None:
        super().__init__(path)

    def load_items(self) -> List[Dict[str, Any]]:
        data = self.load(default=[])
        return data if isinstance(data, list) else []

    def save_items(self, items: List[Dict[str, Any]]) -> None:
        self.save(items)
