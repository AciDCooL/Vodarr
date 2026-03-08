"""Configuration helpers and persisted UI state for the IPTV VOD downloader."""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List

CONFIG_DIR = Path.home() / ".iptv_vod_downloader"
CONFIG_FILE = CONFIG_DIR / "config.json"
QUEUE_STATE_FILE = CONFIG_DIR / "queue_state.json"
UI_STATE_FILE = CONFIG_DIR / "ui_state.json"


@dataclass
class AppConfig:
    """Serializable application configuration."""

    base_url: str = ""
    username: str = ""
    password: str = ""
    download_dir: str = str(Path.home() / "Downloads" / "IPTV-VOD")
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/118.0.5993.70 Safari/537.36"
    )

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
            self._config = AppConfig()
            return self._config

        try:
            with self.path.open("r", encoding="utf-8") as fh:
                raw: Dict[str, Any] = json.load(fh)
        except (json.JSONDecodeError, OSError):
            self._config = AppConfig()
            return self._config

        # Filter out unknown keys to prevent TypeError on dataclass init
        valid_keys = asdict(AppConfig()).keys()
        filtered = {k: v for k, v in raw.items() if k in valid_keys}
        self._config = AppConfig(**{**asdict(AppConfig()), **filtered})
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


@dataclass
class WindowState:
    """Persisted window and UI preferences."""

    geometry: str = "1200x800"
    selected_tab: str = "movies"
    queue_filter: str = "All"
    queue_sort: str = "Insertion order"


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


class UIStateManager(JSONStateManager):
    """Persist window geometry and simple UI preferences."""

    def __init__(self, path: Path = UI_STATE_FILE) -> None:
        super().__init__(path)

    def load_state(self) -> WindowState:
        data = self.load(default={})
        if not isinstance(data, dict):
            return WindowState()
        # Filter out unknown keys to prevent TypeError on dataclass init
        valid_keys = asdict(WindowState()).keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return WindowState(**{**asdict(WindowState()), **filtered})

    def save_state(self, state: WindowState) -> None:
        self.save(asdict(state))
