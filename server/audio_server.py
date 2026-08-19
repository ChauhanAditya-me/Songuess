import os
import io
import subprocess
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from dotenv import load_dotenv

from librespot.core import Session, TrackId
from librespot.audio.decoders import AudioQuality, VorbisOnlyAudioQuality

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audio_server")

# Load environment variables
load_dotenv()

SPOTIFY_USERNAME = os.getenv("SPOTIFY_USERNAME")
SPOTIFY_PASSWORD = os.getenv("SPOTIFY_PASSWORD")
PORT = int(os.getenv("AUDIO_SERVER_PORT", 3001))

app = FastAPI(title="SpotiGuess Librespot Audio Server")

# Enable CORS for local Vite dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session: Optional[Session] = None
# Cache raw Vorbis stream bytes per track_id
track_cache: dict[str, bytes] = {}


CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")


def get_session() -> Session:
    global session
    if session is not None and session.is_valid():
        return session

    builder = Session.Builder()
    builder.conf.stored_credentials_file = CREDENTIALS_FILE

    # 1. Try saved credentials.json if available
    if os.path.exists(CREDENTIALS_FILE):
        try:
            logger.info("Authenticating with saved credentials.json...")
            session = builder.stored_file(CREDENTIALS_FILE).create()
            logger.info("Spotify session created from credentials.json!")
            return session
        except Exception as e:
            logger.warning(f"Failed to restore saved session: {e}")

    # 2. Try username/password from .env
    if SPOTIFY_USERNAME and SPOTIFY_PASSWORD:
        logger.info(f"Authenticating with Spotify as '{SPOTIFY_USERNAME}'...")
        try:
            session = builder.user_pass(SPOTIFY_USERNAME, SPOTIFY_PASSWORD).create()
            logger.info("Spotify session created successfully from .env!")
            return session
        except Exception as e:
            logger.error(f"Failed to authenticate Spotify session: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Spotify auth failed: {e}. (Tip: Run 'npm run login' to log in with 1-click browser OAuth instead)",
            )

    raise HTTPException(
        status_code=500,
        detail="Spotify is not authenticated. Please run 'npm run login' or add SPOTIFY_USERNAME and SPOTIFY_PASSWORD to .env",
    )


@app.on_event("startup")
def startup_event():
    if SPOTIFY_USERNAME and SPOTIFY_PASSWORD:
        try:
            get_session()
        except Exception as e:
            logger.warning(f"Startup Spotify auth warning: {e}")


import threading

fetch_lock = threading.Lock()


def get_track_bytes(raw_track_id: str) -> bytes:
    """Fetch or retrieve cached raw track audio bytes from Spotify (thread-safe)."""
    track_id_clean = raw_track_id.replace("spotify:track:", "").strip()

    if track_id_clean in track_cache:
        return track_cache[track_id_clean]

    with fetch_lock:
        # Check cache again inside lock
        if track_id_clean in track_cache:
            return track_cache[track_id_clean]

        sess = get_session()
        track_id = TrackId.from_base62(track_id_clean)

        logger.info(f"Fetching audio for track {track_id_clean} from Spotify...")
        stream = sess.content_feeder().load(
            track_id,
            VorbisOnlyAudioQuality(AudioQuality.HIGH),
            False,
            None,
        )

        if not stream or not stream.input_stream:
            raise HTTPException(status_code=404, detail="Track audio stream could not be loaded")

        # Read all stream bytes
        raw_data = stream.input_stream.stream().read()
        if not raw_data:
            raise HTTPException(status_code=500, detail="Empty audio stream received")

        # Keep in memory cache (capped to last 50 tracks)
        if len(track_cache) > 50:
            oldest = next(iter(track_cache))
            del track_cache[oldest]

        track_cache[track_id_clean] = raw_data
        logger.info(f"Cached {len(raw_data)} bytes for track {track_id_clean}")
        return raw_data


def slice_audio(raw_vorbis_bytes: bytes, duration: float, start_sec: float = 0.0) -> bytes:
    """Uses ffmpeg to slice exact duration and encode to WAV instantly (<5ms)."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-i", "pipe:0",
        "-ss", str(start_sec),
        "-t", str(duration),
        "-f", "wav",
        "pipe:1",
    ]

    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    out, err = process.communicate(input=raw_vorbis_bytes)

    if process.returncode != 0:
        logger.error(f"FFmpeg error: {err.decode('utf-8', errors='ignore')}")
        raise HTTPException(status_code=500, detail="FFmpeg encoding error")

    return out


@app.get("/")
def root():
    has_creds = bool(SPOTIFY_USERNAME and SPOTIFY_PASSWORD)
    authenticated = session is not None and session.is_valid()
    return {
        "service": "SpotiGuess Librespot Audio Server",
        "status": "online",
        "has_credentials": has_creds,
        "authenticated": authenticated,
        "frontend_url": "http://127.0.0.1:5173",
        "endpoints": {
            "health": "/health",
            "snippet": "/audio/snippet?uri=<spotify_uri>&duration=<seconds>",
            "preload": "/audio/preload?uri=<spotify_uri>"
        }
    }


@app.get("/health")
def health_check():
    has_creds = bool(SPOTIFY_USERNAME and SPOTIFY_PASSWORD)
    authenticated = session is not None and session.is_valid()
    return {
        "status": "ok",
        "has_credentials": has_creds,
        "authenticated": authenticated,
        "cached_tracks": len(track_cache),
    }


@app.get("/audio/snippet")
def get_snippet(
    uri: str = Query(..., description="Spotify track URI (e.g. spotify:track:...) or ID"),
    duration: float = Query(0.5, description="Snippet duration in seconds"),
    start: float = Query(0.0, description="Start offset in seconds"),
):
    try:
        raw_bytes = get_track_bytes(uri)
        wav_snippet = slice_audio(raw_bytes, duration=duration, start_sec=start)
        return Response(
            content=wav_snippet,
            media_type="audio/wav",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(wav_snippet)),
                "Cache-Control": "public, max-age=3600",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error producing audio snippet")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/audio/preload")
def preload_track_audio(
    uri: str = Query(..., description="Spotify track URI or ID"),
):
    try:
        get_track_bytes(uri)
        return {"status": "preloaded", "uri": uri}
    except Exception as e:
        logger.error(f"Preload failed: {e}")
        return {"status": "preload_failed", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=PORT)
