# Stage 1: Build Frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY iptv_vod_downloader/ ./iptv_vod_downloader/
COPY main.py .

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Environment variables
ENV IPTV_PORT=6767
ENV IPTV_CONFIG_DIR=/config
ENV IPTV_DOWNLOAD_DIR=/downloads

# Create volumes
VOLUME ["/config", "/downloads"]

# Expose port
EXPOSE 6767

# Start command
CMD ["uvicorn", "iptv_vod_downloader.web:app", "--host", "0.0.0.0", "--port", "6767"]
