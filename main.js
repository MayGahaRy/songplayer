const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { parseFile } = require("music-metadata");

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".flac",
  ".aac",
  ".wma",
  ".opus",
]);

const DEFAULT_PLAYER_STATE = {
  playlist: [],
  currentIndex: -1,
  selectedIndex: -1,
  repeatMode: "off",
  shuffleEnabled: false,
  volume: 0.85,
};

const REPEAT_MODES = new Set(["off", "all", "one"]);

let mainWindow;
let playerStatePath = "";
const metadataCache = new Map();

function isAudioFile(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalizeTitleFromPath(filePath) {
  const extension = path.extname(filePath);
  const fallbackTitle = path.basename(filePath);
  const normalizedTitle = path
    .basename(filePath, extension)
    .replace(/[_-]+/g, " ")
    .trim();

  return normalizedTitle || fallbackTitle;
}

function toTrack(filePath, title = "") {
  const safeTitle = typeof title === "string" && title.trim() ? title.trim() : normalizeTitleFromPath(filePath);

  return {
    id: filePath,
    path: filePath,
    title: safeTitle,
    fileUrl: pathToFileURL(filePath).href,
  };
}

function normalizeTrack(track) {
  if (!track || typeof track !== "object" || typeof track.path !== "string") {
    return null;
  }

  if (!isAudioFile(track.path)) {
    return null;
  }

  return toTrack(track.path, track.title);
}

function clampNumber(value, minimum, maximum) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function sanitizePlayerState(input) {
  const raw = input && typeof input === "object" ? input : {};
  const playlist = Array.isArray(raw.playlist) ? raw.playlist.map(normalizeTrack).filter(Boolean) : [];

  const currentIndexCandidate = Number.isInteger(raw.currentIndex) ? raw.currentIndex : -1;
  const selectedIndexCandidate = Number.isInteger(raw.selectedIndex) ? raw.selectedIndex : -1;
  const currentIndex = playlist.length > 0
    ? clampNumber(currentIndexCandidate, 0, playlist.length - 1)
    : -1;
  const selectedIndex = playlist.length > 0 && selectedIndexCandidate >= 0
    ? clampNumber(selectedIndexCandidate, 0, playlist.length - 1)
    : -1;

  const repeatMode = REPEAT_MODES.has(raw.repeatMode) ? raw.repeatMode : "off";
  const shuffleEnabled = Boolean(raw.shuffleEnabled);
  const volume = clampNumber(Number(raw.volume), 0, 1);

  return {
    playlist,
    currentIndex,
    selectedIndex,
    repeatMode,
    shuffleEnabled,
    volume,
  };
}

async function filterExistingTracks(playlist) {
  const existing = [];

  for (const track of playlist) {
    try {
      const stats = await fs.stat(track.path);
      if (stats.isFile() && isAudioFile(track.path)) {
        existing.push(track);
      }
    } catch {
      // Ignore missing or inaccessible files from old sessions.
    }
  }

  return existing;
}

async function loadPlayerState() {
  if (!playerStatePath) {
    return { ...DEFAULT_PLAYER_STATE };
  }

  try {
    const raw = await fs.readFile(playerStatePath, "utf8");
    const parsed = JSON.parse(raw);
    const sanitized = sanitizePlayerState(parsed);
    const existingTracks = await filterExistingTracks(sanitized.playlist);

    if (existingTracks.length === 0) {
      return { ...DEFAULT_PLAYER_STATE };
    }

    return sanitizePlayerState({
      ...sanitized,
      playlist: existingTracks,
    });
  } catch {
    return { ...DEFAULT_PLAYER_STATE };
  }
}

async function savePlayerState(state) {
  if (!playerStatePath) {
    return false;
  }

  try {
    const sanitized = sanitizePlayerState(state);
    await fs.mkdir(path.dirname(playerStatePath), { recursive: true });
    await fs.writeFile(playerStatePath, JSON.stringify(sanitized, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

function toCoverDataUrl(picture) {
  if (!picture || !picture.data || !picture.format) {
    return null;
  }

  return `data:${picture.format};base64,${picture.data.toString("base64")}`;
}

async function getTrackDetails(filePath) {
  if (metadataCache.has(filePath)) {
    return metadataCache.get(filePath);
  }

  const fallback = {
    title: normalizeTitleFromPath(filePath),
    artist: "",
    album: "",
    coverDataUrl: null,
  };

  try {
    const metadata = await parseFile(filePath, {
      duration: false,
      skipPostHeaders: true,
    });

    const details = {
      title: (metadata.common.title || fallback.title).trim(),
      artist: (metadata.common.artist || "").trim(),
      album: (metadata.common.album || "").trim(),
      coverDataUrl: toCoverDataUrl(metadata.common.picture?.[0]),
    };

    metadataCache.set(filePath, details);
    return details;
  } catch {
    metadataCache.set(filePath, fallback);
    return fallback;
  }
}

async function collectAudioFiles(rootDir) {
  const discovered = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && isAudioFile(fullPath)) {
        discovered.push(fullPath);
      }
    }
  }

  return discovered.sort((left, right) => left.localeCompare(right));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0a1118",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
}

ipcMain.handle("library:pick-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Select Songs",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Audio Files",
        extensions: ["mp3", "wav", "ogg", "m4a", "flac", "aac", "wma", "opus"],
      },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return [];
  }

  return filePaths.filter(isAudioFile).map((filePath) => toTrack(filePath));
});

ipcMain.handle("library:pick-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Select Music Folder",
    properties: ["openDirectory"],
  });

  if (canceled || filePaths.length === 0) {
    return [];
  }

  const files = await collectAudioFiles(filePaths[0]);
  return files.map((filePath) => toTrack(filePath));
});

ipcMain.handle("track:get-details", async (_, filePath) => {
  if (typeof filePath !== "string" || !isAudioFile(filePath)) {
    return null;
  }

  return getTrackDetails(filePath);
});

ipcMain.handle("state:load", async () => loadPlayerState());

ipcMain.handle("state:save", async (_, payload) => savePlayerState(payload));

app.whenReady().then(() => {
  playerStatePath = path.join(app.getPath("userData"), "player-state.json");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
