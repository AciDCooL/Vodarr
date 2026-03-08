"""
IPTV VOD Downloader - Entry Point
This script handles the application startup, hosting the FastAPI web server.
"""

import logging
import uvicorn

from iptv_vod_downloader.config import CONFIG_DIR

def configure_logging() -> None:
    """Sets up global logging configuration, saving to app.log in the config directory."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=CONFIG_DIR / "app.log",
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

if __name__ == "__main__":
    # Initialize logging
    configure_logging()
    
    # --- WEB SERVER ---
    # Launches the Uvicorn ASGI server to host the FastAPI application.
    # Default port is 6767.
    port = 6767
    print(f"Starting IPTV VOD Downloader web server on port {port}...")
    uvicorn.run("iptv_vod_downloader.web:app", host="0.0.0.0", port=port, log_level="info")
