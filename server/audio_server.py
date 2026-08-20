import os
import io
import subprocess
import logging
import threading
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from dotenv import load_dotenv

from librespot.core import Session, TrackId, OAuth, MercuryRequests
from librespot.audio.decoders import AudioQuality, VorbisOnlyAudioQuality

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audio_server")

# Load environment variables
load_dotenv()

SPOTIFY_USERNAME = os.getenv("SPOTIFY_USERNAME")
SPOTIFY_PASSWORD = os.getenv("SPOTIFY_PASSWORD")
PORT = int(os.getenv("PORT", os.getenv("AUDIO_SERVER_PORT", 3001)))

app = FastAPI(title="Songuess Audio Server")

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

current_oauth_handler: Optional[OAuth] = None
oauth_lock = threading.Lock()


def run_oauth_worker(oauth_handler: OAuth):
    global session, current_oauth_handler
    try:
        oauth_handler.run_callback_server()
        oauth_handler.request_token()
        creds = oauth_handler.get_credentials()

        builder = Session.Builder()
        builder.conf.stored_credentials_file = CREDENTIALS_FILE
        builder.login_credentials = creds
        session = builder.create()
        logger.info("Successfully authenticated Spotify session via Web 1-click OAuth!")
    except Exception as e:
        logger.error(f"Web OAuth background worker failed: {e}")
    finally:
        current_oauth_handler = None


def get_session() -> Session:
    global session
    if session is not None and session.is_valid():
        return session

    builder = Session.Builder()
    builder.conf.stored_credentials_file = CREDENTIALS_FILE

    # 0. Check SPOTIFY_CREDENTIALS env var (for cloud deployments like Render)
    spotify_creds_env = os.getenv("SPOTIFY_CREDENTIALS")
    if spotify_creds_env and not os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
                f.write(spotify_creds_env.strip())
            logger.info("Wrote credentials.json from SPOTIFY_CREDENTIALS env variable!")
        except Exception as e:
            logger.warning(f"Failed to write SPOTIFY_CREDENTIALS: {e}")

    # 1. Try saved credentials.json if available (with 3 retries for cloud networking)
    if os.path.exists(CREDENTIALS_FILE):
        import time
        for attempt in range(1, 4):
            try:
                logger.info(f"Authenticating with saved credentials.json (attempt {attempt}/3)...")
                session = builder.stored_file(CREDENTIALS_FILE).create()
                logger.info("Spotify session created from credentials.json!")
                return session
            except Exception as e:
                logger.warning(f"Attempt {attempt} failed to restore session: {e}")
                if attempt < 3:
                    time.sleep(1.5)

    # 2. Try username/password from .env
    if SPOTIFY_USERNAME and SPOTIFY_PASSWORD:
        logger.info(f"Authenticating with Spotify as '{SPOTIFY_USERNAME}'...")
        try:
            session = builder.user_pass(SPOTIFY_USERNAME, SPOTIFY_PASSWORD).create()
            logger.info("Spotify session created successfully from credentials!")
            return session
        except Exception as e:
            logger.error(f"Failed to authenticate Spotify session: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Spotify auth failed: {e}",
            )

    raise HTTPException(
        status_code=500,
        detail="Spotify is not authenticated. Please run 'npm run login' or add SPOTIFY_USERNAME and SPOTIFY_PASSWORD to .env",
    )


@app.on_event("startup")
def startup_event():
    try:
        get_session()
    except Exception as e:
        logger.info(f"Startup session check: {e}")


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

        track_id = TrackId.from_base62(track_id_clean)
        logger.info(f"Fetching audio for track {track_id_clean} from Spotify...")

        stream = None
        for attempt in range(1, 3):
            try:
                sess = get_session()
                stream = sess.content_feeder().load(
                    track_id,
                    VorbisOnlyAudioQuality(AudioQuality.HIGH),
                    False,
                    None,
                )
                if stream and stream.input_stream:
                    break
            except Exception as e:
                logger.warning(f"Attempt {attempt} failed to load stream: {e}. Reconnecting session...")
                global session
                session = None

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


def slice_audio(raw_vorbis_bytes: bytes, duration: float, start_sec: float = 0.0, format: str = "wav") -> tuple[bytes, str]:
    """Uses ffmpeg to slice exact duration and encode to WAV (snippets) or MP3 (full songs) instantly."""
    if format == "mp3" or duration > 20:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "error",
            "-i", "pipe:0",
            "-ss", str(start_sec),
            "-t", str(min(duration, 300.0)),
            "-c:a", "libmp3lame",
            "-b:a", "192k",
            "-f", "mp3",
            "pipe:1",
        ]
        media_type = "audio/mpeg"
    else:
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
        media_type = "audio/wav"

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

    return out, media_type


@app.get("/")
def root():
    has_creds = bool(SPOTIFY_USERNAME and SPOTIFY_PASSWORD)
    authenticated = session is not None and session.is_valid()
    return {
        "service": "Songuess Audio Server",
        "status": "online",
        "has_credentials": has_creds,
        "authenticated": authenticated,
        "frontend_url": "http://127.0.0.1:5173",
        "endpoints": {
            "health": "/health",
            "snippet": "/audio/snippet?uri=<spotify_uri>&duration=<seconds>",
            "full": "/audio/full?uri=<spotify_uri>",
            "preload": "/audio/preload?uri=<spotify_uri>"
        }
    }


cached_web_token: Optional[dict] = None
cached_web_token_expires: float = 0.0


@app.get("/api/token")
def get_web_token():
    """Returns a valid Spotify Web API access token minted from the Librespot session (cached for 55m)."""
    global cached_web_token, cached_web_token_expires
    import time
    now = time.time()

    if cached_web_token and now < cached_web_token_expires - 300:
        return cached_web_token

    try:
        sess = get_session()
        token_obj = sess.tokens().get_token("user-read-private,playlist-read-private")
        expires_in = getattr(token_obj, "expires_in", 3600) or 3600
        cached_web_token = {
            "access_token": token_obj.access_token,
            "expires_in": expires_in,
        }
        cached_web_token_expires = now + expires_in
        return cached_web_token
    except Exception as e:
        logger.error(f"Failed to mint Web API token: {e}")
        if cached_web_token:
            return cached_web_token
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    global session
    has_creds = os.path.exists(CREDENTIALS_FILE) or bool(SPOTIFY_USERNAME and SPOTIFY_PASSWORD) or bool(os.getenv("SPOTIFY_CREDENTIALS"))
    if (session is None or not session.is_valid()) and has_creds:
        try:
            get_session()
        except Exception:
            pass
    authenticated = session is not None and session.is_valid()
    return {
        "status": "ok",
        "has_credentials": has_creds,
        "authenticated": authenticated,
        "cached_tracks": len(track_cache),
    }


@app.get("/auth/status")
def auth_status():
    global session
    has_creds = os.path.exists(CREDENTIALS_FILE) or bool(SPOTIFY_USERNAME and SPOTIFY_PASSWORD) or bool(os.getenv("SPOTIFY_CREDENTIALS"))
    if (session is None or not session.is_valid()) and has_creds:
        try:
            get_session()
        except Exception:
            pass
    authenticated = session is not None and session.is_valid()
    return {
        "authenticated": authenticated,
        "has_credentials": has_creds,
    }


@app.get("/auth/login-url")
def get_login_url():
    global session, current_oauth_handler

    if session is not None and session.is_valid():
        return {"authenticated": True, "auth_url": None}

    with oauth_lock:
        if current_oauth_handler is not None:
            try:
                auth_url = current_oauth_handler.get_auth_url()
                return {"authenticated": False, "auth_url": auth_url}
            except Exception:
                pass

        oauth = OAuth(MercuryRequests.keymaster_client_id, "http://127.0.0.1:5588/login", None)
        success_html = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Spotify Connected</title></head>
<body style="background:#121212;color:#ffffff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
  <div style="background:#181818;padding:40px;border-radius:12px;border:1px solid #282828;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
    <h2 style="color:#1db954;margin-top:0;font-size:1.6rem;">✅ Connected!</h2>
    <p style="color:#b3b3b3;line-height:1.5;">Your Songuess audio server is now authenticated.</p>
    <p style="color:#888;font-size:0.85rem;margin-top:20px;">You can close this tab and return to the game.</p>
  </div>
</body>
</html>"""
        oauth.set_success_page_content(success_html)
        auth_url = oauth.get_auth_url()
        current_oauth_handler = oauth

        # Run callback server in daemon thread
        t = threading.Thread(target=run_oauth_worker, args=(oauth,), daemon=True)
        t.start()

        return {"authenticated": False, "auth_url": auth_url}


from pydantic import BaseModel


class CodeSubmitPayload(BaseModel):
    code: str


@app.post("/auth/submit-code")
def submit_oauth_code(payload: CodeSubmitPayload):
    global current_oauth_handler, session
    clean_code = payload.code.strip()
    if "code=" in clean_code:
        clean_code = clean_code.split("code=")[1].split("&")[0]

    if not current_oauth_handler:
        current_oauth_handler = OAuth(MercuryRequests.keymaster_client_id, "http://127.0.0.1:5588/login", None)

    try:
        current_oauth_handler.set_code(clean_code)
        current_oauth_handler.request_token()
        creds = current_oauth_handler.get_credentials()

        builder = Session.Builder()
        builder.conf.stored_credentials_file = CREDENTIALS_FILE
        builder.login_credentials = creds
        session = builder.create()
        logger.info("Successfully authenticated Spotify session via code submission!")
        return {"success": True, "authenticated": True}
    except Exception as e:
        logger.error(f"Failed to complete OAuth with code: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/public-playlist")
def get_public_playlist(url: str = Query(..., description="Spotify Playlist URL, URI, or ID")):
    """Fetches public Spotify playlist tracks without requiring user OAuth login."""
    import re
    import json
    import requests

    clean_url = url.strip()
    match = re.search(r"playlist[/:]+([a-zA-Z0-9]+)", clean_url)
    if match:
        playlist_id = match.group(1)
    else:
        playlist_id = clean_url.split("?")[0].split("/")[-1]

    embed_url = f"https://open.spotify.com/embed/playlist/{playlist_id}"
    try:
        resp = requests.get(
            embed_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            timeout=8,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=404, detail="Could not find or load Spotify playlist")

        m = re.search(r"__NEXT_DATA__.*?>(.*?)</script>", resp.text)
        if not m:
            raise HTTPException(status_code=500, detail="Could not parse playlist metadata")

        data = json.loads(m.group(1))
        entity = (
            data.get("props", {})
            .get("pageProps", {})
            .get("state", {})
            .get("data", {})
            .get("entity", {})
        )

        name = entity.get("name") or "Spotify Playlist"
        track_list = entity.get("trackList", [])

        tracks = []
        for t in track_list:
            uri = t.get("uri")
            title = t.get("title")
            subtitle = t.get("subtitle", "")
            if not uri or not title:
                continue

            track_id = uri.replace("spotify:track:", "")
            tracks.append(
                {
                    "id": track_id,
                    "name": title,
                    "uri": uri,
                    "artists": [{"name": subtitle}],
                    "duration_ms": t.get("duration", 0),
                }
            )

        if not tracks:
            raise HTTPException(status_code=404, detail="No playable tracks found in playlist")

        return {
            "id": playlist_id,
            "name": name,
            "tracks": tracks,
            "total": len(tracks),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error loading public playlist")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/audio/snippet")
def get_snippet(
    uri: str = Query(..., description="Spotify track URI (e.g. spotify:track:...) or ID"),
    duration: float = Query(0.5, description="Snippet duration in seconds"),
    start: float = Query(0.0, description="Start offset in seconds"),
):
    try:
        raw_bytes = get_track_bytes(uri)
        fmt = "wav" if duration <= 20 else "mp3"
        audio_data, media_type = slice_audio(raw_bytes, duration=duration, start_sec=start, format=fmt)
        return Response(
            content=audio_data,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(audio_data)),
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error producing audio snippet")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/audio/full")
def get_full_track(
    uri: str = Query(..., description="Spotify track URI (e.g. spotify:track:...) or ID"),
):
    try:
        raw_bytes = get_track_bytes(uri)
        audio_data, media_type = slice_audio(raw_bytes, duration=240.0, start_sec=0.0, format="mp3")
        return Response(
            content=audio_data,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(audio_data)),
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error producing full track audio")
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
