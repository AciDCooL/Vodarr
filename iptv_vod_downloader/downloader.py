"""Download queue and worker management."""

from __future__ import annotations

import threading
import time
import uuid
import datetime
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, List, Optional

import requests

from .api import build_headers
from .utils import ensure_directory

StatusCallback = Callable[["DownloadItem"], None]


@dataclass
class DownloadItem:
    """Represents a queued movie or episode download."""

    item_id: str
    title: str
    stream_url: str
    target_path: Path
    kind: str = "movie"  # either "movie" or "episode"
    meta: dict[str, Any] = field(default_factory=dict)
    status: str = "queued"
    progress: float = 0.0
    speed: float = 0.0  # bytes per second
    downloaded_bytes: int = 0
    total_size: int = 0
    transient_errors: int = 0
    retries: int = 0
    error: Optional[str] = None
    queue_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    _last_notified_status: str = field(default="", init=False, repr=False)
    _last_notified_percent: int = field(default=-1, init=False, repr=False)
    _last_notified_error: Optional[str] = field(default=None, init=False, repr=False)
    _last_notified_transient: int = field(default=0, init=False, repr=False)
    _last_notify_at: float = field(default=0.0, init=False, repr=False)
    _last_speed_at: float = field(default=0.0, init=False, repr=False)
    _last_speed_bytes: int = field(default=0, init=False, repr=False)

    def as_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "title": self.title,
            "stream_url": self.stream_url,
            "target_path": str(self.target_path),
            "kind": self.kind,
            "status": self.status,
            "progress": self.progress,
            "speed": self.speed,
            "downloaded_bytes": self.downloaded_bytes,
            "total_size": self.total_size,
            "transient_errors": self.transient_errors,
            "retries": self.retries,
            "error": self.error,
            "meta": self.meta,
            "queue_id": self.queue_id,
        }


class DownloadCancelled(RuntimeError):
    """Raised when a single queued download is cancelled by the user."""


class DownloadStopped(RuntimeError):
    """Raised when the active download is stopped by the user."""


class DownloadManager:
    """Simple serial download worker."""

    _progress_notify_interval = 0.2
    _speed_update_interval = 1.0
    _idle_wait_timeout = 0.1
    _connect_timeout = 5
    _read_timeout = 10
    _chunk_timeout = 2.0  # seconds to wait for a single chunk before counting as stall
    _max_retries = 5
    _chunk_size = 1024 * 128  # 128 KiB

    def __init__(
        self,
        callback: Optional[StatusCallback] = None,
        user_agent: Optional[str] = None,
        auto_retry: bool = False,
        max_retries: int = 3,
        retry_forever: bool = False,
        retry_start_hour: int = 0,
        retry_end_hour: int = 24,
        url_builder: Optional[Callable[[DownloadItem], str]] = None,
    ) -> None:
        self._queue: List[DownloadItem] = []
        self._lock = threading.Lock()
        self._has_items = threading.Event()
        self._stop_event = threading.Event()
        self._pause_event = threading.Event()
        self._pause_event.set()
        self._paused = False
        self._worker: Optional[threading.Thread] = None
        self._callback = callback
        self._user_agent = user_agent
        self.auto_retry = auto_retry
        self.max_retries = max_retries
        self.retry_forever = retry_forever
        self.retry_start_hour = retry_start_hour
        self.retry_end_hour = retry_end_hour
        self.url_builder = url_builder
        self._current_item: Optional[DownloadItem] = None
        self._current_response: Optional[requests.Response] = None
        self._cancelled_queue_ids: set[str] = set()
        self._pause_requested_queue_id: Optional[str] = None

    def update_user_agent(self, user_agent: str) -> None:
        self._user_agent = user_agent

    def update_retry_settings(self, auto_retry: bool, max_retries: int, retry_forever: bool, start_hour: int, end_hour: int) -> None:
        self.auto_retry = auto_retry
        self.max_retries = max_retries
        self.retry_forever = retry_forever
        self.retry_start_hour = start_hour
        self.retry_end_hour = end_hour

    def start(self) -> None:
        if self._worker and self._worker.is_alive():
            return
        self._stop_event.clear()
        self._pause_event.set()
        self._paused = False
        self._worker = threading.Thread(target=self._run, name="DownloadWorker", daemon=True)
        self._worker.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._has_items.set()
        self._interrupt_current_download()
        if self._worker and self._worker.is_alive():
            self._worker.join(timeout=2)

    def pause(self) -> None:
        self._paused = True
        self._pause_event.clear()
        item = self._current_item
        if item and item.status == "downloading":
            self._pause_requested_queue_id = item.queue_id
            item.status = "paused"
            item.speed = 0.0
            self._notify(item, force=True)
            self._interrupt_current_download()

    def resume(self) -> None:
        self.start()
        self._paused = False
        self._pause_event.set()
        item = self._current_item
        if item and item.status == "paused":
            item.status = "downloading"
            self._notify(item)

    def stop_all(self) -> None:
        self._paused = False
        self._pause_event.set()
        self._stop_event.set()
        self._has_items.set()
        with self._lock:
            queued = list(self._queue)
            self._queue.clear()
        for item in queued:
            item.status = "stopped"
            item.error = "stopped by user"
            item.speed = 0.0
            self._notify(item)

        current = self._current_item
        if current and current.status in {"downloading", "paused"}:
            current.status = "stopped"
            current.error = "stopped by user"
            current.speed = 0.0
            self._notify(current, force=True)
        self._interrupt_current_download()

    def add_items(self, items: Iterable[DownloadItem]) -> None:
        with self._lock:
            for item in items:
                self._queue.append(item)
                self._notify(item)
            if self._queue:
                self._has_items.set()

    def remove_item(self, queue_id: str) -> bool:
        with self._lock:
            for idx, item in enumerate(self._queue):
                if item.queue_id == queue_id and item.status in {"queued", "paused"}:
                    del self._queue[idx]
                    item.status = "removed"
                    item.speed = 0.0
                    self._notify(item)
                    return True
            current = self._current_item
            if current and current.queue_id == queue_id and current.status in {"downloading", "paused"}:
                self._cancelled_queue_ids.add(queue_id)
                self._interrupt_current_download()
                return True
        return False

    def restart_item(self, item: DownloadItem) -> None:
        """Resets item stats and re-queues it."""
        item.status = "queued"
        item.progress = 0.0
        item.speed = 0.0
        item.downloaded_bytes = 0
        item.transient_errors = 0
        item.retries = 0
        item.error = None
        with self._lock:
            self._queue.append(item)
            self._has_items.set()
        self._notify(item, force=True)

    def queued_items(self) -> List[DownloadItem]:
        with self._lock:
            return list(self._queue)

    # Internal helpers -------------------------------------------------

    def _is_in_download_window(self) -> bool:
        """Checks if current local time is within the allowed download window."""
        if self.retry_start_hour == 0 and self.retry_end_hour == 24:
            return True
        
        now = datetime.datetime.now().hour
        if self.retry_start_hour <= self.retry_end_hour:
            # Standard window (e.g., 08:00 to 22:00)
            return self.retry_start_hour <= now < self.retry_end_hour
        else:
            # Overnight window (e.g., 22:00 to 08:00)
            return now >= self.retry_start_hour or now < self.retry_end_hour

    def _run(self) -> None:
        while not self._stop_event.is_set():
            self._pause_event.wait()
            
            # Check for download window BEFORE picking up an item
            if not self._is_in_download_window():
                # Notify UI if we have a current item, otherwise just wait
                if self._current_item:
                    self._current_item.status = "queued"
                    self._current_item.error = f"Waiting for download window ({self.retry_start_hour:02d}:00 - {self.retry_end_hour:02d}:00)"
                    self._notify(self._current_item, force=True)
                
                time.sleep(60) # Wait a minute before checking window again
                continue

            item = self._next_item()
            if item is None:
                self._has_items.wait(timeout=self._idle_wait_timeout)
                continue

            # --- DYNAMIC URL REFRESH ---
            # If a builder is provided, get the latest URL (handles cred changes)
            if self.url_builder:
                with suppress(Exception):
                    item.stream_url = self.url_builder(item)

            session = requests.Session()
            session.headers.update(build_headers(self._user_agent or ""))
            session.headers["Accept"] = "*/*"
            try:
                self._download_item(session, item)
                
                # Check for auto-retry if failed
                if item.status == "failed" and self.auto_retry:
                    # Respect download window for retries too
                    while not self._is_in_download_window() and not self._stop_event.is_set():
                        item.error = f"Waiting for download window ({self.retry_start_hour:02d}:00 - {self.retry_end_hour:02d}:00)"
                        self._notify(item, force=True)
                        time.sleep(60)
                    
                    if self._stop_event.is_set():
                        break

                    can_retry = self.retry_forever or (item.retries < self.max_retries)
                    
                    if can_retry:
                        item.retries += 1
                        
                        # --- FALLBACK ROTATION ---
                        # If we have fallback URLs in meta, cycle to the next one
                        fallbacks = item.meta.get("fallbacks", [])
                        if fallbacks and (item.retries - 1) < len(fallbacks):
                            new_url = fallbacks[item.retries - 1]
                            item.stream_url = new_url
                            
                            # Update target path extension to match new URL
                            new_ext = new_url.split(".")[-1]
                            if len(new_ext) <= 4: # Sanity check for extension
                                item.target_path = item.target_path.with_suffix(f".{new_ext}")
                            
                            item.error = f"Auto-retry {item.retries}{'' if self.retry_forever else '/' + str(self.max_retries)} (Format swap: .{new_ext})"
                        else:
                            item.error = f"Auto-retry {item.retries}{'' if self.retry_forever else '/' + str(self.max_retries)}"
                        
                        item.status = "queued"
                        item.speed = 0.0
                        item.progress = 0.0
                        item.downloaded_bytes = 0
                        
                        # Clean up temp file if we are switching formats or retrying fresh
                        temp_path = item.target_path.with_suffix(item.target_path.suffix + ".part")
                        with suppress(Exception):
                            if temp_path.exists():
                                temp_path.unlink()

                        with self._lock:
                            self._queue.append(item)
                            self._has_items.set()
                        self._notify(item, force=True)
            finally:
                session.close()

        self._current_response = None
        self._worker = None
        self._stop_event.clear()
        self._current_item = None

    def _next_item(self) -> Optional[DownloadItem]:
        with self._lock:
            if not self._queue:
                self._has_items.clear()
                return None
            item = self._queue.pop(0)
            self._current_item = item
            return item

    def _download_item(self, session: requests.Session, item: DownloadItem) -> None:
        item.status = "downloading"
        item.error = None
        item.speed = 0.0
        item.downloaded_bytes = 0
        item.total_size = 0
        item.transient_errors = 0
        self._notify(item, force=True)

        target = item.target_path
        ensure_directory(target.parent)
        temp_path = target.with_suffix(target.suffix + ".part")

        if target.exists():
            item.status = "completed"
            item.progress = 1.0
            item.speed = 0.0
            item.total_size = target.stat().st_size
            item.downloaded_bytes = item.total_size
            self._notify(item, force=True)
            return

        retries = 0
        while retries <= self._max_retries:
            try:
                existing_size = temp_path.stat().st_size if temp_path.exists() else 0
                request_headers: dict[str, str] = {}
                if existing_size:
                    request_headers["Range"] = f"bytes={existing_size}-"
                
                with session.get(
                    item.stream_url,
                    stream=True,
                    timeout=(self._connect_timeout, self._read_timeout),
                    headers=request_headers,
                ) as resp:
                    self._current_response = resp
                    resp.raise_for_status()
                    total = self._resolve_total_size(resp, existing_size)
                    item.total_size = total
                    downloaded = existing_size
                    
                    file_mode = "ab" if existing_size and resp.status_code == 206 else "wb"
                    if file_mode == "wb":
                        downloaded = 0
                        existing_size = 0

                    item._last_speed_bytes = downloaded
                    item._last_speed_at = time.monotonic()
                    item.downloaded_bytes = downloaded

                    if total:
                        item.progress = min(0.99, downloaded / total)
                        self._notify(item)

                    with temp_path.open(file_mode) as fh:
                        start_time = time.time()
                        chunk_iterator = resp.iter_content(chunk_size=self._chunk_size)
                        
                        while True:
                            chunk_start = time.monotonic()
                            try:
                                chunk = next(chunk_iterator)
                            except StopIteration:
                                break
                            except (requests.RequestException, Exception) as e:
                                item.transient_errors += 1
                                self._notify(item, force=True)
                                raise e

                            elapsed_chunk = time.monotonic() - chunk_start
                            if elapsed_chunk > self._chunk_timeout:
                                item.transient_errors += 1
                                self._notify(item, force=True)

                            if self._stop_event.is_set():
                                raise DownloadStopped("Download stopped by user.")
                            if item.queue_id in self._cancelled_queue_ids:
                                raise DownloadCancelled("Download cancelled by user.")
                            
                            while self._paused and not self._stop_event.is_set():
                                if item.queue_id in self._cancelled_queue_ids:
                                    raise DownloadCancelled("Download cancelled by user.")
                                item.status = "paused"
                                item.speed = 0.0
                                self._notify(item)
                                self._pause_event.wait(timeout=0.2)
                            
                            if item.status == "paused" and not self._paused:
                                item.status = "downloading"
                                self._notify(item)

                            if not chunk:
                                continue
                            
                            fh.write(chunk)
                            downloaded += len(chunk)
                            item.downloaded_bytes = downloaded

                            now = time.monotonic()
                            if now - item._last_speed_at >= self._speed_update_interval:
                                diff = downloaded - item._last_speed_bytes
                                item.speed = diff / (now - item._last_speed_at)
                                item._last_speed_bytes = downloaded
                                item._last_speed_at = now

                            if total:
                                item.progress = downloaded / total
                            else:
                                elapsed = time.time() - start_time
                                item.progress = min(0.99, elapsed / 10.0)
                            self._notify(item)

                # Successful full download
                temp_path.replace(target)
                item.status = "completed"
                item.progress = 1.0
                item.speed = 0.0
                item.downloaded_bytes = item.total_size
                item.error = None
                self._notify(item, force=True)
                return

            except (DownloadCancelled, DownloadStopped):
                raise
            except (requests.RequestException, Exception) as exc:
                retries += 1
                item.transient_errors += 1
                self._notify(item, force=True)
                
                if retries > self._max_retries or self._stop_event.is_set() or self._paused:
                    if not self._handle_transfer_exception(item, temp_path, exc):
                        item.status = "failed"
                        item.error = str(exc)
                        item.speed = 0.0
                        self._notify(item, force=True)
                    return
                
                # Wait a bit before retrying
                time.sleep(min(retries * 2, 10))

    def _handle_transfer_exception(self, item: DownloadItem, temp_path: Path, exc: Exception) -> bool:
        if item.queue_id in self._cancelled_queue_ids:
            item.status = "cancelled"
            item.error = "Download cancelled by user."
            item.progress = 0.0
            item.speed = 0.0
            if temp_path.exists():
                temp_path.unlink(missing_ok=True)
            self._notify(item, force=True)
            return True
        if self._stop_event.is_set():
            item.status = "stopped"
            item.error = "Download stopped by user."
            item.speed = 0.0
            self._notify(item, force=True)
            return True
        if self._pause_requested_queue_id == item.queue_id or self._paused:
            item.status = "paused"
            item.error = None
            item.speed = 0.0
            self._requeue_front(item)
            self._notify(item, force=True)
            return True
        return False

    def _requeue_front(self, item: DownloadItem) -> None:
        with self._lock:
            self._queue.insert(0, item)
            self._has_items.set()

    def _interrupt_current_download(self) -> None:
        response = self._current_response
        if response is None:
            return
        with suppress(Exception):
            response.close()

    def _notify(self, item: DownloadItem, force: bool = False) -> None:
        if not self._callback:
            return

        percent = max(0, min(100, int(item.progress * 100)))
        now = time.monotonic()
        status_changed = item.status != item._last_notified_status
        error_changed = item.error != item._last_notified_error
        percent_changed = percent != item._last_notified_percent
        transient_changed = item.transient_errors != item._last_notified_transient

        if not force and not status_changed and not error_changed and not transient_changed:
            if not percent_changed:
                if now - item._last_notify_at < 1.0: # update speed every sec even if progress same
                    return
            if now - item._last_notify_at < self._progress_notify_interval:
                return

        self._callback(item)
        item._last_notified_status = item.status
        item._last_notified_percent = percent
        item._last_notified_error = item.error
        item._last_notified_transient = item.transient_errors
        item._last_notify_at = now

    @staticmethod
    def _resolve_total_size(resp: requests.Response, existing_size: int) -> int:
        content_range = resp.headers.get("Content-Range", "")
        if "/" in content_range:
            tail = content_range.rsplit("/", 1)[-1]
            if tail.isdigit():
                return int(tail)
        content_length = resp.headers.get("Content-Length")
        if content_length and content_length.isdigit():
            length = int(content_length)
            if resp.status_code == 206:
                return existing_size + length
            return length
        return 0
