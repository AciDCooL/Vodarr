"""
IPTV VOD Downloader - Entry Point
This script handles the application startup, supporting both 
Desktop (Tkinter) and Web (FastAPI) modes.
"""

import logging
import sys
import argparse
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
    # --- CLI Argument Parsing ---
    parser = argparse.ArgumentParser(description="IPTV VOD Downloader")
    
    # Run in headless mode (FastAPI web server)
    parser.add_argument("--headless", action="store_true", help="Run without GUI (web mode)")
    
    # Specify the port for the web server
    parser.add_argument("--port", type=int, default=6767, help="Web server port (default: 6767)")
    
    args = parser.parse_args()

    # Initialize logging
    configure_logging()
    
    if args.headless:
        # --- WEB MODE ---
        # Launches the Uvicorn ASGI server to host the FastAPI application.
        # This is the mode used within Docker containers.
        print(f"Starting web server on port {args.port}...")
        uvicorn.run("iptv_vod_downloader.web:app", host="0.0.0.0", port=args.port, log_level="info")
    else:
        # --- DESKTOP MODE ---
        # Standard Tkinter GUI application.
        try:
            # We import GUI here to avoid requiring Tkinter/Pillow dependencies
            # when running in purely headless (Docker) environments.
            from iptv_vod_downloader.gui import run_app
            run_app()
        except ImportError:
            print("Error: GUI dependencies not found. Please run with --headless")
            sys.exit(1)
        except KeyboardInterrupt:
            sys.exit(130)
