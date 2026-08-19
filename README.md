# Songuess 🎵

An interactive music guessing game that tests how quickly you can recognize tracks from your favorite playlists!

---

## ✨ Features

- **Progressive Snippet Reveals:** Guess songs from ultra-short audio snippets (0.1s, 0.5s, 1s, etc.).
- **Smart Song Search:** Fast fuzzy search to find and submit guesses quickly.
- **Ultra-Fast Local Audio Backend:** Near-zero latency snippet playback and caching.
- **Responsive Web UI:** Clean, modern interface designed for desktop and mobile browsers.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://python.org/) (v3.10+) with [FFmpeg](https://ffmpeg.org/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ChauhanAditya-me/songuess.git
   cd songuess
   ```

2. Install dependencies:
   ```bash
   npm install
   pip install -r server/requirements.txt
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in your developer credentials.

4. Start the application:
   ```bash
   # Terminal 1: Start audio server
   npm run server

   # Terminal 2: Start frontend dev server
   npm run dev
   ```

5. Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser.

---

## 📜 License
MIT License.
