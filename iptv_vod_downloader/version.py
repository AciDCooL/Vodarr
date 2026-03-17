from pathlib import Path

def get_version() -> str:
    """Reads the version from the VERSION file at the project root."""
    version_file = Path(__file__).parent.parent / "VERSION"
    if version_file.exists():
        return version_file.read_text().strip()
    return "0.0.0-unknown"

VERSION = get_version()
