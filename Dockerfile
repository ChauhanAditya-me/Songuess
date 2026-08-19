FROM python:3.11-slim

# Install system dependencies (FFmpeg is required for audio slicing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY server/requirements.txt ./server/
RUN pip install --no-cache-dir -r server/requirements.txt

# Copy server source code
COPY server/ ./server/

ENV PYTHONUNBUFFERED=1

# Expose default Render port
EXPOSE 10000

# Start Uvicorn audio server
CMD ["sh", "-c", "uvicorn server.audio_server:app --host 0.0.0.0 --port ${PORT:-10000}"]
