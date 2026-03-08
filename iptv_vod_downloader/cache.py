"""SQLite caching for IPTV VOD and Series lists."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import CONFIG_DIR

CACHE_DB = CONFIG_DIR / "cache.db"

class CacheManager:
    def __init__(self, db_path: Path = CACHE_DB):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initializes the cache database and creates necessary tables."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
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
