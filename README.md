# Song Player (Electron)

Desktop song player built with Electron. It supports:

- Adding individual songs
- Importing a full folder (recursive)
- Playlist selection and removal
- Play/pause, previous/next
- Shuffle and repeat modes
- Seek bar and volume control
- Album cover display from file metadata
- Persistent player state (playlist, current track, settings)
- Keyboard shortcuts (`Space`, `Left`, `Right`, `Delete`)

## Run

```bash
npm install
npm start
```

## Build Installer

```bash
npm run build
npm run dist
```

- `npm run build` creates an unpacked app in `release/`
- `npm run dist` creates an installer (NSIS on Windows)

## Git / GitHub Quick Start

```bash
git init
git branch -M main
git add .
git commit -m "Initial PulseDeck player"
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

A GitHub Actions workflow is included at `.github/workflows/windows-build.yml`.

## GitHub Release Automation

Release assets are auto-generated from tags via `.github/workflows/release.yml`.

```bash
git tag v1.0.1
git push origin v1.0.1
```

This creates a GitHub Release and uploads:
- `release/PulseDeck Setup <version>.exe`
- `release/PulseDeck Setup <version>.exe.blockmap`

## Project Structure

- `main.js`: Electron main process + dialogs + metadata + state persistence
- `preload.js`: Safe bridge between renderer and main process IPC
- `src/index.html`: App UI markup
- `src/styles.css`: Spotify-inspired visual style and responsive layout
- `src/renderer.js`: Player behavior, cover loading, and state sync
