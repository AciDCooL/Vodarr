"""Download queue and worker management."""

from __future__ import annotations

import threading
import time
import uuid
import datetime
import logging
from contextlib import suppress

logger = logging.getLogger(__name__)
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
    _chunk_timeout = 2.0  # seconds to wait for a single chunk before counting as stall
    _chunk_size = 1024 * 128  # 128 KiB

    def __init__(
        self,
        callback: Optional[StatusCallback] = None,
        user_agent: Optional[str] = None,
        auto_retry: bool = False,
        max_retries: int = 3,
        queue_retry_limit: int = 10,
        check_stream_limit: bool = True,
        stream_limit_check_interval: int = 60,
        enable_download_window: bool = False,
        retry_start_hour: int = 0,
        retry_end_hour: int = 24,
        connect_timeout: int = 5,
        read_timeout: int = 10,
        url_builder: Optional[Callable[[DownloadItem], str]] = None,
        account_checker: Optional[Callable[[], Dict[str, Any]]] = None,
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
        self.queue_retry_limit = queue_retry_limit
        self._queue_retry_count = 0
        self.check_stream_limit = check_stream_limit
        self.stream_limit_interval = stream_limit_check_interval
        self._is_stream_limit_reached = False
        self.enable_download_window = enable_download_window
        self.retry_start_hour = retry_start_hour
        self.retry_end_hour = retry_end_hour
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.url_builder = url_builder
        self.account_checker = account_checker
        self._current_item: Optional[DownloadItem] = None
        self._current_response: Optional[requests.Response] = None
        self._cancelled_queue_ids: set[str] = set()
        self._pause_requested_queue_id: Optional[str] = None

    def update_user_agent(self, user_agent: str) -> None:
        self._user_agent = user_agent

    def update_retry_settings(self, auto_retry: bool, max_retries: int, start_hour: int, end_hour: int, enable_window: bool = False, queue_retry_limit: int = 10) -> None:
        self.auto_retry = auto_retry
        self.max_retries = max_retries
        self.queue_retry_limit = queue_retry_limit
        self.retry_start_hour = start_hour
        self.retry_end_hour = end_hour
        self.enable_download_window = enable_window

    def update_stream_limit_settings(self, enabled: bool, interval: int) -> None:
        self.check_stream_limit = enabled
        self.stream_limit_interval = interval

    def update_timeout_settings(self, connect_timeout: int, read_timeout: int) -> None:
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout

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
        if not self.enable_download_window:
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
                # Update the status of the first item in the queue to show why we are waiting
                with self._lock:
                    if self._queue:
                        wait_item = self._queue[0]
                        wait_item.status = "queued"
                        wait_item.error = f"Waiting for download window ({self.retry_start_hour:02d}:00 - {self.retry_end_hour:02d}:00)"
                        self._notify(wait_item, force=True)
                
                time.sleep(5) # Check every 5 seconds for the window to open
                continue

            # --- STREAM LIMIT CHECK ---
            if self.check_stream_limit and self.account_checker:
                try:
                    account = self.account_checker()
                    u = account.get("user_info", {})
                    active = int(u.get("active_cons") or 0)
                    max_cons = int(u.get("max_connections") or 1)
                    
                    if active >= max_cons:
                        logger.warning(f"Stream limit reached ({active}/{max_cons}). Waiting {self.stream_limit_interval}s...")
                        if self._callback:
                            self._callback("trigger-stream-limit-reached")
                        
                        # Update status of next item to inform user
                        with self._lock:
                            if self._queue:
                                item = self._queue[0]
                                item.status = "queued"
                                item.error = f"Waiting: Stream limit reached ({active}/{max_cons})"
                                self._notify(item, force=True)
                        
                        time.sleep(self.stream_limit_interval)
                        continue
                    else:
                        if self._callback:
                            self._callback("trigger-stream-limit-cleared")
                except Exception as e:
                    logger.error(f"Failed to check stream limit: {e}")

            item = self._next_item()
            if item is None:
                # QUEUE IS EMPTY - Check if we should auto-retry all failures
                if self.auto_retry and self._queue_retry_count < self.queue_retry_limit:
                    self._queue_retry_count += 1
                    logger.info(f"Queue exhausted. Auto-retry attempt {self._queue_retry_count}/{self.queue_retry_limit} starting...")
                    # We signal the UI to find all failed and re-add them
                    if self._callback:
                        self._callback("trigger-queue-retry")
                    
                    # Wait a bit before checking again to allow items to be re-added
                    time.sleep(5)
                    continue
                
                self._has_items.wait(timeout=self._idle_wait_timeout)
                continue

            # Reset full queue retry count if we just picked up a completely new item
            if item.retries == 0:
                self._queue_retry_count = 0

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

                    can_retry = (item.retries < self.max_retries)
                    
                    if can_retry:
                        item.retries += 1
                        item.error = f"Auto-retry {item.retries}"
                        item.status = "queued"
                        item.speed = 0.0
                        
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
        # Preserve existing metadata if we are resuming from DB
        item.transient_errors = 0
        
        target = item.target_path
        ensure_directory(target.parent)
        temp_path = target.with_suffix(target.suffix + ".part")

        # Initial check for .part file to update progress immediately
        if temp_path.exists():
            item.downloaded_bytes = temp_path.stat().st_size
            if item.total_size > 0:
                item.progress = item.downloaded_bytes / item.total_size
        
        self._notify(item, force=True)

        if target.exists():
            item.status = "completed"
            item.progress = 1.0
            item.speed = 0.0
            item.total_size = target.stat().st_size
            item.downloaded_bytes = item.total_size
            self._notify(item, force=True)
            return

        try:
            existing_size = temp_path.stat().st_size if temp_path.exists() else 0
            request_headers: dict[str, str] = {}
            if existing_size:
                request_headers["Range"] = f"bytes={existing_size}-"
            
            with session.get(
                item.stream_url,
                stream=True,
                timeout=(self.connect_timeout, self.read_timeout),
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
                        
                        # Check window and pause state
                        while (self._paused or not self._is_in_download_window()) and not self._stop_event.is_set():
                            if item.queue_id in self._cancelled_queue_ids:
                                raise DownloadCancelled("Download cancelled by user.")
                            
                            if not self._is_in_download_window():
                                item.status = "queued"
                                item.error = f"Paused: Outside download window ({self.retry_start_hour:02d}:00 - {self.retry_end_hour:02d}:00)"
                            else:
                                item.status = "paused"
                                item.error = None
                                
                            item.speed = 0.0
                            self._notify(item)
                            self._pause_event.wait(timeout=1.0)
                        
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

            # --- COMPLETION VERIFICATION ---
            # Ensure we didn't exit the loop because of a preemption or pause
            if item.status == "queued" or self._paused:
                self._handle_transfer_exception(item, temp_path, Exception("Interrupted"))
                return

            # If we have a known total, verify we actually got it all
            if total > 0 and downloaded < total:
                raise requests.RequestException(f"Connection closed prematurely ({format_size(downloaded)} / {format_size(total)})")

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
            if not self._handle_transfer_exception(item, temp_path, exc):
                item.status = "failed"
                item.error = str(exc)
                item.speed = 0.0
                self._notify(item, force=True)
            return

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
        if self._pause_requested_queue_id == item.queue_id or self._paused or item.status == "paused":
            item.status = "paused"
            item.error = None
            item.speed = 0.0
            self._requeue_front(item)
            self._notify(item, force=True)
            return True
        if item.status == "queued":
            # Item was preempted by reordering - it is already in the new _queue list
            # but we need to notify and clear speed
            item.speed = 0.0
            self._notify(item, force=True)
            return True
        return False

    def reorder_queue(self, new_order: List[str]) -> None:
        """Reorders the internal queue based on the provided list of queue_ids and preempts current if needed."""
        with self._lock:
            # 1. Gather all items (pending + current)
            all_items_map = {item.queue_id: item for item in self._queue}
            if self._current_item:
                all_items_map[self._current_item.queue_id] = self._current_item

            # 2. Reconstruct the full list based on new_order
            new_full_list = []
            for qid in new_order:
                if qid in all_items_map:
                    new_full_list.append(all_items_map[qid])

            if not new_full_list:
                return

            new_top_item = new_full_list[0]
            
            # 3. If the current item is no longer the top item, we need to preempt it
            if self._current_item and self._current_item.queue_id != new_top_item.queue_id:
                curr = self._current_item
                # Only preempt if it was actually downloading or paused (not just finishing)
                if curr.status in {"downloading", "paused"}:
                    curr.status = "queued" # Mark as queued so it doesn't count as a failure
                    curr.speed = 0.0
                    self._notify(curr, force=True)
                    self._interrupt_current_download()
                    # It will be caught by the exception handler and added back to the queue
            
            # 4. Update the pending queue (excluding current if it's still top)
            if self._current_item and self._current_item.queue_id == new_top_item.queue_id:
                self._queue[:] = new_full_list[1:]
            else:
                self._queue[:] = new_full_list

            # Signal that items are available
            if self._queue:
                self._has_items.set()

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
