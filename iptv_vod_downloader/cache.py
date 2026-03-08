"""SQLite caching for IPTV VOD and Series lists, config, and queue."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import CONFIG_DIR, AppConfig

CACHE_DB = CONFIG_DIR / "vodarr.db"

class DatabaseManager:
    def __init__(self, db_path: Path = CACHE_DB):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initializes the database and creates necessary tables."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            # Table for App Configuration (Key-Value style for simplicity)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """)
            
            # Table for Download Queue
            conn.execute("""
                CREATE TABLE IF NOT EXISTS queue (
                    queue_id TEXT PRIMARY KEY,
                    item_data TEXT
                )
            """)

            # Table for tracking when a category was last updated
            conn.execute("""
                CREATE TABLE IF NOT EXISTS category_sync (
                    kind TEXT,
                    category_id TEXT,
                    last_updated REAL,
                    PRIMARY KEY (kind, category_id)
                )
            """)
            # Table for storing the items (JSON blob for flexibility)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS items (
                    kind TEXT,
                    category_id TEXT,
                    item_data TEXT
                )
            """)
            # Index for faster retrieval
            conn.execute("CREATE INDEX IF NOT EXISTS idx_items_kind_cat ON items (kind, category_id)")

    # --- Config Management ---

    def get_config(self) -> Dict[str, Any]:
        """Retrieves all configuration keys from the database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT key, value FROM config")
            data = {}
            for key, value in cursor:
                try:
                    data[key] = json.loads(value)
                except:
                    data[key] = value
            return data

    def save_config(self, config_dict: Dict[str, Any]):
        """Saves configuration key-value pairs to the database."""
        with sqlite3.connect(self.db_path) as conn:
            for key, value in config_dict.items():
                conn.execute(
                    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                    (key, json.dumps(value))
                )

    # --- Queue Management ---

    def get_queue(self) -> List[Dict[str, Any]]:
        """Retrieves all items in the download queue."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT item_data FROM queue")
            items = []
            for row in cursor:
                items.append(json.loads(row[0]))
            return items

    def save_queue(self, items: List[Dict[str, Any]]):
        """Saves the entire queue to the database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM queue")
            conn.executemany(
                "INSERT INTO queue (queue_id, item_data) VALUES (?, ?)",
                [(item.get("queue_id"), json.dumps(item)) for item in items]
            )

    # --- Catalog Cache Management ---

    def get_items(self, kind: str, category_id: str, expiry_hours: int) -> Optional[List[Dict[str, Any]]]:
        """Retrieves items from the cache if they haven't expired."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT last_updated FROM category_sync WHERE kind = ? AND category_id = ?",
                (kind, category_id)
            )
            row = cursor.fetchone()
            if not row:
                return None

            last_updated = row[0]
            if (time.time() - last_updated) > (expiry_hours * 3600):
                return None

            cursor = conn.execute(
                "SELECT item_data FROM items WHERE kind = ? AND category_id = ?",
                (kind, category_id)
            )
            items = []
            for item_row in cursor:
                items.append(json.loads(item_row[0]))
            return items if items else None

    def set_items(self, kind: str, category_id: str, items: List[Dict[str, Any]]):
        """Stores items in the cache and updates the last_updated timestamp."""
        with sqlite3.connect(self.db_path) as conn:
            # Clear old items
            conn.execute("DELETE FROM items WHERE kind = ? AND category_id = ?", (kind, category_id))
            # Insert new items
            conn.executemany(
                "INSERT INTO items (kind, category_id, item_data) VALUES (?, ?, ?)",
                [(kind, category_id, json.dumps(item)) for item in items]
            )
            # Update sync timestamp
            conn.execute(
                "INSERT OR REPLACE INTO category_sync (kind, category_id, last_updated) VALUES (?, ?, ?)",
                (kind, category_id, time.time())
            )

    def clear_category(self, kind: str, category_id: str):
        """Forces a refresh by removing cache entries for a category."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM category_sync WHERE kind = ? AND category_id = ?", (kind, category_id))
            conn.execute("DELETE FROM items WHERE kind = ? AND category_id = ?", (kind, category_id))

    def get_categories(self, kind: str, expiry_hours: int) -> Optional[List[Dict[str, Any]]]:
        """Retrieves categories from the cache if they haven't expired."""
        return self.get_items(kind, "_categories_", expiry_hours)

    def set_categories(self, kind: str, categories: List[Dict[str, Any]]):
        """Stores categories in the cache."""
        self.set_items(kind, "_categories_", categories)
