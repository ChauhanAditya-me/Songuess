import os
import webbrowser
import logging
from librespot.core import Session

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("spotify_login")

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")


def open_browser(url: str):
    print("\n" + "=" * 60)
    print("Opening Spotify login in your browser...")
    print(f"If it doesn't open automatically, visit this URL:\n{url}")
    print("=" * 60 + "\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main():
    print("Starting Spotify 1-click OAuth Login for Librespot...")
    builder = Session.Builder()
    builder.conf.stored_credentials_file = CREDENTIALS_FILE

    if os.path.exists(CREDENTIALS_FILE):
        print(f"Existing credentials found at {CREDENTIALS_FILE}. Re-authenticating...")
        try:
            os.remove(CREDENTIALS_FILE)
        except Exception:
            pass

    try:
        session = builder.oauth(open_browser).create()
        print("\n✅ Successfully authenticated with Spotify!")
        print(f"Credentials securely saved to: {CREDENTIALS_FILE}")
        print("You can now run: npm run server")
    except Exception as e:
        print(f"\n❌ Login failed: {e}")


if __name__ == "__main__":
    main()
