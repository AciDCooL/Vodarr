"""
IPTV VOD Downloader - Entry Point
This script handles the application startup, hosting the FastAPI web server.
"""

import os
import sys
import logging
import uvicorn

from iptv_vod_downloader.config import CONFIG_DIR

def configure_logging() -> None:
    """Sets up global logging configuration to both file and stdout."""
    debug_env = os.getenv("IPTV_DEBUG", "false").lower() == "true"
    log_level = logging.DEBUG if debug_env else logging.INFO
    
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    
    # Define format
    log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format=log_format,
        datefmt=date_format,
        handlers=[
            logging.FileHandler(CONFIG_DIR / "app.log"),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Reduce noise from 3rd party libs unless in debug
    if not debug_env:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("uvicorn.error").setLevel(logging.INFO)
        logging.getLogger("requests").setLevel(logging.WARNING)
        logging.getLogger("urllib3").setLevel(logging.WARNING)
    else:
        logging.getLogger("uvicorn.access").setLevel(logging.DEBUG)
        logging.getLogger("uvicorn.error").setLevel(logging.DEBUG)

if __name__ == "__main__":
    # Initialize logging before any other imports
    configure_logging()
    
    logger = logging.getLogger("vodarr.main")
    
    # --- WEB SERVER ---
    # Launches the Uvicorn ASGI server to host the FastAPI application.
    port = int(os.getenv("IPTV_PORT", "6767"))
    debug_mode = os.getenv("IPTV_DEBUG", "false").lower() == "true"
    
    logger.info("==================================================")
    logger.info(f"Vodarr starting on port {port} (Debug: {debug_mode})")
    logger.info("==================================================")
    
    from iptv_vod_downloader.web import app
    
    try:
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=port, 
            log_level="debug" if debug_mode else "info"
        )
    except Exception as e:
        logger.critical(f"Application crashed with unhandled error: {e}", exc_info=True)
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("Application stopped by user")
        sys.exit(0)
