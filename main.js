const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");
const fsNative = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { parseFile } = require("music-metadata");

let ytDlpExec = null;
let ytDlpBinaryPath = "";
let ytDlpDownloadScriptPath = "";

try {
  ytDlpExec = require("yt-dlp-exec");
  const ytDlpConstants = require("yt-dlp-exec/src/constants");
  ytDlpBinaryPath = typeof ytDlpConstants?.YOUTUBE_DL_PATH === "string" ? ytDlpConstants.YOUTUBE_DL_PATH : "";
  ytDlpDownloadScriptPath = require.resolve("yt-dlp-exec/scripts/postinstall.js");
} catch {
  ytDlpExec = null;
  ytDlpBinaryPath = "";
  ytDlpDownloadScriptPath = "";
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".flac",
  ".aac",
  ".wma",
  ".opus",
  ".webm",
]);

const DEFAULT_PLAYLIST_NAME = "Main Playlist";
const DEFAULT_THEME_ACCENT = "#25d061";
const DEFAULT_PLAYER_STATE = {
  playlists: [
    {
      id: "default",
      name: DEFAULT_PLAYLIST_NAME,
      tracks: [],
      coverDataUrl: null,
    },
  ],
  activePlaylistId: "default",
  playlist: [],
  currentIndex: -1,
  selectedIndex: -1,
  repeatMode: "off",
  shuffleEnabled: false,
  volume: 0.85,
  likedTrackIds: [],
  filterMode: "all",
  searchQuery: "",
  settings: {
    autoPlayOnStartup: false,
    themeAccent: DEFAULT_THEME_ACCENT,
    outputDeviceId: "",
  },
};

const REPEAT_MODES = new Set(["off", "all", "one"]);
const FILTER_MODES = new Set(["all", "favorites"]);
const COVER_MIME_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["webp", "image/webp"],
  ["tiff", "image/tiff"],
  ["tif", "image/tiff"],
]);
const LINK_RESOLVE_TIMEOUT_MS = 30000;
const LINK_DOWNLOAD_TIMEOUT_MS = 300000;
const LINK_IMAGE_TIMEOUT_MS = 25000;
const LINK_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LINK_CACHE_FOLDER_NAME = "link-cache";
const LINK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PulseDeck/1.0";
const YT_DLP_BROWSER_COOKIE_CANDIDATES = ["chrome", "edge", "firefox", "brave"];

let mainWindow;
let playerStatePath = "";
const metadataCache = new Map();
let ytDlpEnsurePromise = null;

function createDefaultPlaylists() {
  return [
    {
      id: "default",
      name: DEFAULT_PLAYLIST_NAME,
      tracks: [],
      coverDataUrl: null,
    },
  ];
}

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

function normalizeTitleFromUrl(urlValue) {
  try {
    const parsed = new URL(urlValue);
    const tail = parsed.pathname.split("/").pop() || parsed.hostname || "Link Song";
    const decoded = decodeURIComponent(tail);
    const withoutExt = decoded.replace(/\.[^/.]+$/, "");
    const normalized = withoutExt.replace(/[_-]+/g, " ").trim();
    return normalized || withoutExt || decoded || "Link Song";
  } catch {
    return "Link Song";
  }
}

function getPathFromFileUrl(fileUrl) {
  if (typeof fileUrl !== "string" || !fileUrl.trim()) {
    return "";
  }

  try {
    const parsed = new URL(fileUrl);
    if (parsed.protocol !== "file:") {
      return "";
    }

    return fileURLToPath(parsed);
  } catch {
    return "";
  }
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
  if (!track || typeof track !== "object") {
    return null;
  }

  const requestedType = typeof track.sourceType === "string" ? track.sourceType.trim().toLowerCase() : "";
  const sourceUrlCandidate = normalizeHttpUrl(track.sourceUrl || track.path);
  const hasLinkShape = Boolean(sourceUrlCandidate) && (
    (typeof track.cachedFilePath === "string" && track.cachedFilePath.trim())
    || getPathFromFileUrl(track.fileUrl)
  );

  if (requestedType === "link" || hasLinkShape) {
    const sourceUrl = sourceUrlCandidate;
    const cachedFilePath = typeof track.cachedFilePath === "string" && track.cachedFilePath.trim()
      ? track.cachedFilePath.trim()
      : getPathFromFileUrl(track.fileUrl);
    if (!sourceUrl || !cachedFilePath || !isAudioFile(cachedFilePath)) {
      return null;
    }

    const sourceHost = (() => {
      try {
        return new URL(sourceUrl).hostname || "link";
      } catch {
        return "link";
      }
    })();
    const sourcePlatform = typeof track.sourcePlatform === "string" && track.sourcePlatform.trim()
      ? track.sourcePlatform.trim().toLowerCase()
      : getHostPlatform(sourceHost);
    const title = typeof track.title === "string" && track.title.trim()
      ? track.title.trim()
      : normalizeTitleFromUrl(sourceUrl);
    const artist = typeof track.artist === "string" ? track.artist.trim().slice(0, 140) : "";
    const album = typeof track.album === "string" ? track.album.trim().slice(0, 140) : sourceHost;
    const id = typeof track.id === "string" && track.id.trim()
      ? track.id.trim()
      : `link:${createHash("sha1").update(sourceUrl).digest("hex")}`;

    return {
      id,
      path: sourceUrl,
      title,
      fileUrl: pathToFileURL(cachedFilePath).href,
      sourceType: "link",
      sourceUrl,
      sourceHost,
      sourcePlatform,
      cachedFilePath,
      coverDataUrl: normalizeCoverDataUrl(track.coverDataUrl),
      artist,
      album,
    };
  }

  if (typeof track.path !== "string" || !track.path.trim()) {
    return null;
  }

  const filePath = track.path.trim();
  if (!isAudioFile(filePath)) {
    return null;
  }

  const localTrack = toTrack(filePath, track.title);
  return {
    ...localTrack,
    sourceType: "file",
    cachedFilePath: filePath,
    coverDataUrl: normalizeCoverDataUrl(track.coverDataUrl),
    artist: typeof track.artist === "string" ? track.artist.trim().slice(0, 140) : "",
    album: typeof track.album === "string" ? track.album.trim().slice(0, 140) : "",
  };
}

function normalizeCoverDataUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/")) {
    return null;
  }

  return trimmed;
}

function sanitizePlaylistName(name, fallback) {
  if (typeof name === "string" && name.trim()) {
    return name.trim().slice(0, 80);
  }

  return fallback;
}

function normalizePlaylist(rawPlaylist, fallbackId, fallbackName) {
  if (!rawPlaylist || typeof rawPlaylist !== "object") {
    return {
      id: fallbackId,
      name: fallbackName,
      tracks: [],
      coverDataUrl: null,
    };
  }

  const tracks = Array.isArray(rawPlaylist.tracks)
    ? rawPlaylist.tracks.map(normalizeTrack).filter(Boolean)
    : [];

  const id = typeof rawPlaylist.id === "string" && rawPlaylist.id.trim()
    ? rawPlaylist.id.trim().slice(0, 80)
    : fallbackId;

  return {
    id,
    name: sanitizePlaylistName(rawPlaylist.name, fallbackName),
    tracks,
    coverDataUrl: normalizeCoverDataUrl(rawPlaylist.coverDataUrl),
  };
}

function clampNumber(value, minimum, maximum) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeThemeAccent(value, fallback = DEFAULT_THEME_ACCENT) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function sanitizePlayerState(input) {
  const raw = input && typeof input === "object" ? input : {};
  const rawPlaylists = Array.isArray(raw.playlists) && raw.playlists.length > 0
    ? raw.playlists
    : [{
      id: "default",
      name: DEFAULT_PLAYLIST_NAME,
      tracks: Array.isArray(raw.playlist) ? raw.playlist : [],
    }];

  const playlists = [];
  const usedIds = new Set();

  for (let index = 0; index < rawPlaylists.length; index += 1) {
    const fallbackId = `playlist-${index + 1}`;
    const fallbackName = index === 0 ? DEFAULT_PLAYLIST_NAME : `Playlist ${index + 1}`;
    const normalized = normalizePlaylist(rawPlaylists[index], fallbackId, fallbackName);

    let normalizedId = normalized.id;
    let suffix = 2;
    while (usedIds.has(normalizedId)) {
      normalizedId = `${normalized.id}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(normalizedId);

    playlists.push({
      id: normalizedId,
      name: normalized.name,
      tracks: normalized.tracks,
      coverDataUrl: normalized.coverDataUrl,
    });
  }

  const safePlaylists = playlists.length > 0 ? playlists : createDefaultPlaylists();
  const activePlaylistIdCandidate = typeof raw.activePlaylistId === "string" ? raw.activePlaylistId : safePlaylists[0].id;
  const activePlaylist = safePlaylists.find((playlist) => playlist.id === activePlaylistIdCandidate) || safePlaylists[0];
  const activePlaylistId = activePlaylist.id;
  const playlist = activePlaylist.tracks;
  const allTrackIds = new Set();
  for (const playlistEntry of safePlaylists) {
    for (const track of playlistEntry.tracks) {
      allTrackIds.add(track.id);
    }
  }

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
  const likedTrackIds = Array.isArray(raw.likedTrackIds)
    ? [...new Set(raw.likedTrackIds.filter((id) => typeof id === "string" && id.trim()))].filter((id) => allTrackIds.has(id))
    : [];
  const filterMode = FILTER_MODES.has(raw.filterMode) ? raw.filterMode : "all";
  const searchQuery = typeof raw.searchQuery === "string" ? raw.searchQuery.slice(0, 160) : "";
  const rawSettings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const settings = {
    autoPlayOnStartup: Boolean(rawSettings.autoPlayOnStartup),
    themeAccent: normalizeThemeAccent(rawSettings.themeAccent),
    outputDeviceId: typeof rawSettings.outputDeviceId === "string" ? rawSettings.outputDeviceId.slice(0, 240) : "",
  };

  return {
    playlists: safePlaylists,
    activePlaylistId,
    playlist,
    currentIndex,
    selectedIndex,
    repeatMode,
    shuffleEnabled,
    volume,
    likedTrackIds,
    filterMode,
    searchQuery,
    settings,
  };
}

async function filterExistingTracks(playlist) {
  const existing = [];

  for (const track of playlist) {
    const sourceType = typeof track?.sourceType === "string" ? track.sourceType.trim().toLowerCase() : "file";
    const candidatePath = sourceType === "link"
      ? (typeof track.cachedFilePath === "string" ? track.cachedFilePath.trim() : "")
      : (typeof track.path === "string" ? track.path.trim() : "");
    if (!candidatePath || !isAudioFile(candidatePath)) {
      continue;
    }

    try {
      const stats = await fs.stat(candidatePath);
      if (stats.isFile()) {
        if (sourceType === "link") {
          track.cachedFilePath = candidatePath;
          track.fileUrl = pathToFileURL(candidatePath).href;
        }
        existing.push(track);
      }
    } catch {
      // Ignore missing or inaccessible files from old sessions.
    }
  }

  return existing;
}

async function filterExistingPlaylists(playlists) {
  const normalizedPlaylists = [];

  for (let index = 0; index < playlists.length; index += 1) {
    const playlist = playlists[index];
    const fallbackId = `playlist-${index + 1}`;
    const fallbackName = index === 0 ? DEFAULT_PLAYLIST_NAME : `Playlist ${index + 1}`;
    const safePlaylist = normalizePlaylist(playlist, fallbackId, fallbackName);
    const existingTracks = await filterExistingTracks(safePlaylist.tracks);

    normalizedPlaylists.push({
      id: safePlaylist.id,
      name: safePlaylist.name,
      tracks: existingTracks,
      coverDataUrl: safePlaylist.coverDataUrl,
    });
  }

  return normalizedPlaylists.length > 0 ? normalizedPlaylists : createDefaultPlaylists();
}

async function loadPlayerState() {
  if (!playerStatePath) {
    return sanitizePlayerState(DEFAULT_PLAYER_STATE);
  }

  try {
    const raw = await fs.readFile(playerStatePath, "utf8");
    const parsed = JSON.parse(raw);
    const sanitized = sanitizePlayerState(parsed);
    const existingPlaylists = await filterExistingPlaylists(sanitized.playlists);

    return sanitizePlayerState({
      ...sanitized,
      playlists: existingPlaylists,
      activePlaylistId: sanitized.activePlaylistId,
    });
  } catch {
    return sanitizePlayerState(DEFAULT_PLAYER_STATE);
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

function normalizeCoverMimeType(format) {
  if (typeof format !== "string" || !format.trim()) {
    return null;
  }

  const value = format.trim().toLowerCase();
  if (value.includes("/")) {
    return value;
  }

  return COVER_MIME_TYPES.get(value) || null;
}

function toCoverDataUrl(picture) {
  if (!picture || !picture.data || picture.data.length === 0) {
    return null;
  }

  const mimeType = normalizeCoverMimeType(picture.format) || "image/jpeg";
  const bytes = Buffer.from(picture.data);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function extensionToMime(extensionWithDot) {
  const extension = String(extensionWithDot || "").toLowerCase().replace(/^\./, "");
  return COVER_MIME_TYPES.get(extension) || null;
}

function fileBufferToImageDataUrl(filePath, bytes) {
  const mimeType = extensionToMime(path.extname(filePath)) || "image/png";
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
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

function normalizeHttpUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function getHostPlatform(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase().replace(/^www\./, "");
  if (!normalized) {
    return "link";
  }

  if (normalized === "youtu.be" || normalized === "youtube.com" || normalized.endsWith(".youtube.com")) {
    return "youtube";
  }
  if (normalized === "soundcloud.com" || normalized.endsWith(".soundcloud.com")) {
    return "soundcloud";
  }
  if (normalized.includes("bandcamp")) {
    return "bandcamp";
  }
  if (normalized.includes("mixcloud")) {
    return "mixcloud";
  }

  return "link";
}

function getPreferredAudioFormatSelector(platform) {
  const normalized = typeof platform === "string" ? platform.trim().toLowerCase() : "";

  if (normalized === "soundcloud") {
    return "bestaudio[protocol=http][ext=mp3]/bestaudio[protocol=http]/bestaudio[ext=mp3]/bestaudio/best";
  }

  if (normalized === "youtube") {
    return "bestaudio[protocol^=http][ext=m4a]/bestaudio[protocol^=http][ext=webm]/bestaudio[protocol^=http]/bestaudio/best";
  }

  return "bestaudio[protocol^=http]/bestaudio/best";
}

function isLikelyDirectAudioUrl(parsedUrl) {
  if (!parsedUrl || typeof parsedUrl.pathname !== "string") {
    return false;
  }

  const pathname = parsedUrl.pathname.toLowerCase();
  for (const extension of AUDIO_EXTENSIONS) {
    if (pathname.endsWith(extension)) {
      return true;
    }
  }

  return false;
}

function takeFirstLine(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[0] || "";
}

function runCommandCapture(command, args, timeoutMs = LINK_RESOLVE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 12 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            stdout: typeof stdout === "string" ? stdout : "",
            stderr: typeof stderr === "string" ? stderr : "",
            errorMessage: typeof error.message === "string" ? error.message : "",
          });
          return;
        }

        resolve({
          ok: true,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          errorMessage: "",
        });
      },
    );
  });
}

async function runCommandCaptureStdout(command, args, timeoutMs = LINK_RESOLVE_TIMEOUT_MS) {
  const result = await runCommandCapture(command, args, timeoutMs);
  return result.ok ? result.stdout : "";
}

async function fileExists(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runNodeScript(scriptPath, timeoutMs = 60000) {
  return new Promise((resolve) => {
    if (typeof scriptPath !== "string" || !scriptPath.trim()) {
      resolve(false);
      return;
    }

    execFile(
      process.execPath,
      [scriptPath],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error) => {
        resolve(!error);
      },
    );
  });
}

async function ensureYtDlpBinary() {
  if (!ytDlpExec || !ytDlpBinaryPath) {
    return false;
  }

  if (await fileExists(ytDlpBinaryPath)) {
    return true;
  }

  if (!ytDlpDownloadScriptPath) {
    return false;
  }

  if (!ytDlpEnsurePromise) {
    ytDlpEnsurePromise = (async () => {
      await runNodeScript(ytDlpDownloadScriptPath, 90000);
      return fileExists(ytDlpBinaryPath);
    })().finally(() => {
      ytDlpEnsurePromise = null;
    });
  }

  try {
    return Boolean(await ytDlpEnsurePromise);
  } catch {
    return false;
  }
}

function getYtDlpCookieProfiles(platform = "link") {
  const normalized = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  const profiles = [{ browser: "", cliArgs: [] }];

  if (normalized === "youtube") {
    for (const browser of YT_DLP_BROWSER_COOKIE_CANDIDATES) {
      profiles.push({
        browser,
        cliArgs: ["--cookies-from-browser", browser],
      });
    }
  }

  return profiles;
}

function detectYtDlpReason(rawErrorText) {
  const text = String(rawErrorText || "").toLowerCase();
  if (!text) {
    return "";
  }

  if (text.includes("sign in to confirm") && text.includes("not a bot")) {
    return "youtube_sign_in_required";
  }
  if (text.includes("private video")) {
    return "youtube_private_video";
  }
  if (text.includes("video unavailable")) {
    return "youtube_unavailable";
  }
  if (text.includes("requested format is not available")) {
    return "requested_format_unavailable";
  }

  return "";
}

async function resolveLinkWithYtDlpExec(sourceUrl, platform = "link") {
  if (!ytDlpExec) {
    return null;
  }

  const binaryReady = await ensureYtDlpBinary();
  if (!binaryReady) {
    return null;
  }

  const primarySelector = getPreferredAudioFormatSelector(platform);
  const selectors = [...new Set([primarySelector, "bestaudio/best"])];
  const cookieProfiles = getYtDlpCookieProfiles(platform);

  let streamUrl = "";
  let selectedCookieBrowser = "";
  let lastReason = "";

  for (const selector of selectors) {
    for (const profile of cookieProfiles) {
      const options = {
        noWarnings: true,
        noPlaylist: true,
        format: selector,
        getUrl: true,
      };
      if (profile.browser) {
        options.cookiesFromBrowser = profile.browser;
      }

      try {
        const streamOutput = await ytDlpExec(
          sourceUrl,
          options,
          {
            windowsHide: true,
            timeout: LINK_RESOLVE_TIMEOUT_MS,
          },
        );
        streamUrl = takeFirstLine(streamOutput);
        if (streamUrl) {
          selectedCookieBrowser = profile.browser;
          break;
        }
      } catch (error) {
        const reason = detectYtDlpReason(error?.stderr || error?.message || "");
        if (reason) {
          lastReason = reason;
        }
        streamUrl = "";
      }
    }

    if (streamUrl) {
      break;
    }
  }

  if (!streamUrl) {
    return {
      streamUrl: "",
      title: "",
      reason: lastReason,
    };
  }

  let title = "";
  const titleOptions = {
    noWarnings: true,
    noPlaylist: true,
    print: "title",
  };
  if (selectedCookieBrowser) {
    titleOptions.cookiesFromBrowser = selectedCookieBrowser;
  }

  try {
    const titleOutput = await ytDlpExec(
      sourceUrl,
      titleOptions,
      {
        windowsHide: true,
        timeout: LINK_RESOLVE_TIMEOUT_MS,
      },
    );
    title = takeFirstLine(titleOutput);
  } catch {
    title = "";
  }

  return {
    streamUrl,
    title,
    reason: "",
  };
}

async function resolveLinkWithYtDlp(sourceUrl, platform = "link") {
  const packageResolved = await resolveLinkWithYtDlpExec(sourceUrl, platform);
  if (packageResolved?.streamUrl) {
    return packageResolved;
  }

  const primarySelector = getPreferredAudioFormatSelector(platform);
  const selectors = [...new Set([primarySelector, "bestaudio/best"])];
  const cookieProfiles = getYtDlpCookieProfiles(platform);
  const commandVariants = [
    {
      command: "yt-dlp",
      argsPrefix: [],
    },
    {
      command: "python",
      argsPrefix: ["-m", "yt_dlp"],
    },
  ];

  let streamUrl = "";
  let selectedCookieProfile = cookieProfiles[0];
  let selectedCommand = commandVariants[0];
  let lastReason = packageResolved?.reason || "";

  for (const selector of selectors) {
    for (const cookieProfile of cookieProfiles) {
      for (const commandVariant of commandVariants) {
        const streamArgs = [
          ...commandVariant.argsPrefix,
          "--no-warnings",
          "--no-playlist",
          ...cookieProfile.cliArgs,
          "-f",
          selector,
          "-g",
          sourceUrl,
        ];
        const streamResult = await runCommandCapture(commandVariant.command, streamArgs);
        streamUrl = takeFirstLine(streamResult.stdout);
        if (streamUrl) {
          selectedCookieProfile = cookieProfile;
          selectedCommand = commandVariant;
          break;
        }

        const reason = detectYtDlpReason(`${streamResult.stderr}\n${streamResult.errorMessage}`);
        if (reason) {
          lastReason = reason;
        }
      }
      if (streamUrl) {
        break;
      }
    }
    if (streamUrl) {
      break;
    }
  }

  if (!streamUrl) {
    return {
      streamUrl: "",
      title: "",
      reason: lastReason,
    };
  }

  const baseTitleArgs = [
    ...selectedCommand.argsPrefix,
    "--no-warnings",
    "--no-playlist",
    ...selectedCookieProfile.cliArgs,
    "--print",
    "title",
    sourceUrl,
  ];
  const titleResult = await runCommandCapture(selectedCommand.command, baseTitleArgs);
  const title = takeFirstLine(titleResult.stdout);

  return {
    streamUrl,
    title,
    reason: "",
  };
}

async function resolvePlayableLink(rawUrl) {
  const sourceUrl = normalizeHttpUrl(rawUrl);
  if (!sourceUrl) {
    return null;
  }

  const parsed = new URL(sourceUrl);
  const host = parsed.hostname || "link";
  const platform = getHostPlatform(host);

  if (isLikelyDirectAudioUrl(parsed)) {
    return {
      sourceUrl,
      streamUrl: sourceUrl,
      host,
      platform: "direct",
      resolved: false,
      warning: "",
      title: "",
    };
  }

  const resolved = await resolveLinkWithYtDlp(sourceUrl, platform);
  const normalizedResolvedStream = normalizeHttpUrl(resolved?.streamUrl);
  if (normalizedResolvedStream) {
    return {
      sourceUrl,
      streamUrl: normalizedResolvedStream,
      host,
      platform,
      resolved: true,
      warning: "",
      title: resolved?.title || "",
    };
  }

  const reason = typeof resolved?.reason === "string" ? resolved.reason : "";
  let warning = "";
  if (platform === "youtube") {
    if (reason === "youtube_sign_in_required") {
      warning = "This YouTube video requires sign-in/bot verification. Try another video or sign in to YouTube in your browser and retry.";
    } else if (reason === "youtube_private_video") {
      warning = "This YouTube video is private.";
    } else if (reason === "youtube_unavailable") {
      warning = "This YouTube video is unavailable.";
    } else {
      warning = "Could not resolve stream URL yet. Keep internet connected for yt-dlp setup, or use a direct audio link.";
    }
  } else if (platform === "soundcloud") {
    warning = "Could not resolve stream URL yet. Keep internet connected for yt-dlp setup, or use a direct audio link.";
  }

  return {
    sourceUrl,
    streamUrl: sourceUrl,
    host,
    platform,
    resolved: false,
    warning,
    title: "",
  };
}

function normalizePrintedValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "na" || lowered === "none" || lowered === "null" || lowered === "n/a") {
    return "";
  }

  return normalized;
}

function normalizeAudioExtension(extensionLike) {
  const raw = String(extensionLike || "").trim().toLowerCase().replace(/^\./, "");
  if (!raw) {
    return "";
  }

  const withDot = `.${raw}`;
  return AUDIO_EXTENSIONS.has(withDot) ? withDot : "";
}

function getAudioExtensionFromContentType(contentType) {
  const value = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (!value) {
    return "";
  }

  if (value === "audio/mpeg" || value === "audio/mp3") {
    return ".mp3";
  }
  if (value === "audio/mp4" || value === "audio/x-m4a" || value === "audio/m4a") {
    return ".m4a";
  }
  if (value === "video/mp4") {
    return ".m4a";
  }
  if (value === "video/webm") {
    return ".webm";
  }
  if (value === "audio/ogg") {
    return ".ogg";
  }
  if (value === "audio/opus") {
    return ".opus";
  }
  if (value === "audio/webm") {
    return ".webm";
  }
  if (value === "audio/flac") {
    return ".flac";
  }
  if (value === "audio/wav" || value === "audio/x-wav") {
    return ".wav";
  }
  if (value === "audio/aac") {
    return ".aac";
  }

  return "";
}

function getAudioExtensionFromUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return normalizeAudioExtension(path.extname(parsed.pathname || ""));
  } catch {
    return "";
  }
}

function chooseCachedAudioExtension(platform, streamUrl, metadataExt = "") {
  const preferred = normalizeAudioExtension(metadataExt);
  if (preferred) {
    return preferred;
  }

  const fromStream = getAudioExtensionFromUrl(streamUrl);
  if (fromStream) {
    return fromStream;
  }

  if (platform === "youtube") {
    return ".m4a";
  }
  if (platform === "soundcloud") {
    return ".mp3";
  }

  return ".mp3";
}

function pickThumbnailUrlFromInfo(info) {
  const direct = normalizeHttpUrl(info?.thumbnail);
  if (direct) {
    return direct;
  }

  const thumbnails = Array.isArray(info?.thumbnails) ? info.thumbnails : [];
  for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeHttpUrl(thumbnails[index]?.url);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function parseYtDlpInfo(rawOutput) {
  let parsed = null;
  if (rawOutput && typeof rawOutput === "object") {
    parsed = rawOutput;
  } else if (typeof rawOutput === "string" && rawOutput.trim()) {
    try {
      parsed = JSON.parse(rawOutput.trim());
    } catch {
      return null;
    }
  } else {
    return null;
  }

  const title = normalizePrintedValue(parsed?.title);
  const artist = normalizePrintedValue(parsed?.uploader || parsed?.artist || parsed?.channel || "");
  const thumbnailUrl = pickThumbnailUrlFromInfo(parsed);
  const ext = normalizeAudioExtension(parsed?.ext);

  return {
    title,
    artist,
    thumbnailUrl,
    ext,
  };
}

async function resolveLinkInfoWithYtDlpExec(sourceUrl, platform = "link") {
  if (!ytDlpExec) {
    return null;
  }

  const binaryReady = await ensureYtDlpBinary();
  if (!binaryReady) {
    return null;
  }

  const selector = getPreferredAudioFormatSelector(platform);
  const candidateSelectors = [...new Set([selector, "bestaudio/best"])];

  for (const candidate of candidateSelectors) {
    try {
      const infoOutput = await ytDlpExec(
        sourceUrl,
        {
          noWarnings: true,
          noPlaylist: true,
          skipDownload: true,
          dumpSingleJson: true,
          format: candidate,
        },
        {
          windowsHide: true,
          timeout: LINK_RESOLVE_TIMEOUT_MS,
        },
      );
      const parsed = parseYtDlpInfo(infoOutput);
      if (parsed) {
        return parsed;
      }
    } catch {
      // Try next selector or fallback path.
    }
  }

  return null;
}

async function resolveLinkInfoWithCli(sourceUrl, platform = "link") {
  const selector = getPreferredAudioFormatSelector(platform);
  const candidateSelectors = [...new Set([selector, "bestaudio/best"])];
  const commandPairs = [
    {
      command: "yt-dlp",
      argsFactory: (formatSelector) => [
        "--no-warnings",
        "--no-playlist",
        "--skip-download",
        "--dump-single-json",
        "-f",
        formatSelector,
        sourceUrl,
      ],
    },
    {
      command: "python",
      argsFactory: (formatSelector) => [
        "-m",
        "yt_dlp",
        "--no-warnings",
        "--no-playlist",
        "--skip-download",
        "--dump-single-json",
        "-f",
        formatSelector,
        sourceUrl,
      ],
    },
  ];

  for (const formatSelector of candidateSelectors) {
    for (const pair of commandPairs) {
      const output = await runCommandCaptureStdout(pair.command, pair.argsFactory(formatSelector));
      const parsed = parseYtDlpInfo(output);
      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

async function resolveLinkInfo(sourceUrl, platform = "link") {
  const packageInfo = await resolveLinkInfoWithYtDlpExec(sourceUrl, platform);
  if (packageInfo) {
    return packageInfo;
  }

  return resolveLinkInfoWithCli(sourceUrl, platform);
}

function getLinkCacheDirectory() {
  const baseDir = app.isReady() ? app.getPath("userData") : process.cwd();
  return path.join(baseDir, LINK_CACHE_FOLDER_NAME);
}

async function findCachedAudioFile(cacheDir, key) {
  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    const matches = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(key) && isAudioFile(entry.name))
      .map((entry) => path.join(cacheDir, entry.name))
      .sort((left, right) => left.localeCompare(right));
    for (const matchPath of matches) {
      try {
        const stats = await fs.stat(matchPath);
        if (stats.isFile() && stats.size > 0) {
          return matchPath;
        }
      } catch {
        // Keep searching other cached candidates.
      }
    }
    return "";
  } catch {
    return "";
  }
}

async function downloadUrlToAudioFile(urlValue, destinationPath, timeoutMs = LINK_DOWNLOAD_TIMEOUT_MS) {
  const sourceUrl = normalizeHttpUrl(urlValue);
  if (!sourceUrl || typeof destinationPath !== "string" || !destinationPath.trim()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const tmpPath = `${destinationPath}.part`;

  try {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": LINK_USER_AGENT,
      },
    });
    if (!response.ok || !response.body) {
      return null;
    }

    const responseExt = getAudioExtensionFromContentType(response.headers.get("content-type") || "");
    const responseUrlExt = getAudioExtensionFromUrl(response.url || "");
    const sourceUrlExt = getAudioExtensionFromUrl(sourceUrl);
    const resolvedExtension = responseExt || responseUrlExt || sourceUrlExt;
    if (!resolvedExtension) {
      return null;
    }

    const basePath = destinationPath.slice(0, destinationPath.length - path.extname(destinationPath).length);
    const finalPath = `${basePath}${resolvedExtension}`;

    await pipeline(Readable.fromWeb(response.body), fsNative.createWriteStream(tmpPath));
    const stats = await fs.stat(tmpPath).catch(() => null);
    if (!stats || stats.size <= 0) {
      await fs.rm(tmpPath, { force: true });
      return null;
    }

    await fs.rm(finalPath, { force: true });
    await fs.rename(tmpPath, finalPath);
    return finalPath;
  } catch {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageAsDataUrl(urlValue) {
  const imageUrl = normalizeHttpUrl(urlValue);
  if (!imageUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": LINK_USER_AGENT,
      },
    });
    if (!response.ok) {
      return null;
    }

    const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > LINK_MAX_IMAGE_BYTES) {
      return null;
    }

    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function prepareLinkTrack(rawUrl) {
  const resolved = await resolvePlayableLink(rawUrl);
  if (!resolved) {
    return null;
  }

  const sourceUrl = normalizeHttpUrl(resolved.sourceUrl);
  if (!sourceUrl) {
    return null;
  }

  const streamUrl = normalizeHttpUrl(resolved.streamUrl) || sourceUrl;
  const sourceHost = typeof resolved.host === "string" && resolved.host.trim() ? resolved.host.trim() : "link";
  const sourcePlatform = typeof resolved.platform === "string" && resolved.platform.trim()
    ? resolved.platform.trim().toLowerCase()
    : getHostPlatform(sourceHost);
  let parsedSourceUrl = null;
  try {
    parsedSourceUrl = new URL(sourceUrl);
  } catch {
    parsedSourceUrl = null;
  }
  const sourceIsDirectAudio = isLikelyDirectAudioUrl(parsedSourceUrl);
  if (!resolved.resolved && !sourceIsDirectAudio) {
    return null;
  }

  const linkInfo = await resolveLinkInfo(sourceUrl, sourcePlatform);
  const title = normalizePrintedValue(linkInfo?.title)
    || normalizePrintedValue(resolved.title)
    || normalizeTitleFromUrl(sourceUrl);
  const artist = normalizePrintedValue(linkInfo?.artist) || sourceHost;
  const metadataExtension = normalizeAudioExtension(linkInfo?.ext);
  const cacheKey = createHash("sha1").update(sourceUrl).digest("hex");
  const cacheDir = getLinkCacheDirectory();
  const defaultExtension = chooseCachedAudioExtension(sourcePlatform, streamUrl, metadataExtension);
  const expectedPath = path.join(cacheDir, `${cacheKey}${defaultExtension}`);

  await fs.mkdir(cacheDir, { recursive: true });
  let cachedAudioPath = await findCachedAudioFile(cacheDir, cacheKey);
  if (!cachedAudioPath) {
    const downloadCandidates = [];
    if (resolved.resolved) {
      if (streamUrl) {
        downloadCandidates.push(streamUrl);
      }
      if (sourceIsDirectAudio && sourceUrl !== streamUrl) {
        downloadCandidates.push(sourceUrl);
      }
    } else if (sourceIsDirectAudio) {
      downloadCandidates.push(sourceUrl);
    }

    for (const candidate of downloadCandidates) {
      cachedAudioPath = await downloadUrlToAudioFile(candidate, expectedPath, LINK_DOWNLOAD_TIMEOUT_MS);
      if (cachedAudioPath) {
        break;
      }
    }
  }

  if (!cachedAudioPath || !(await fileExists(cachedAudioPath)) || !isAudioFile(cachedAudioPath)) {
    return null;
  }

  const thumbnailUrl = normalizeHttpUrl(linkInfo?.thumbnailUrl);
  const coverDataUrl = normalizeCoverDataUrl(await fetchImageAsDataUrl(thumbnailUrl));

  return {
    id: `link:${cacheKey}`,
    path: sourceUrl,
    title,
    fileUrl: pathToFileURL(cachedAudioPath).href,
    sourceType: "link",
    sourceUrl,
    sourceHost,
    sourcePlatform,
    cachedFilePath: cachedAudioPath,
    coverDataUrl,
    artist,
    album: sourceHost,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0a1118",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  if (process.platform !== "darwin") {
    mainWindow.removeMenu();
  }
}

function getStartupLaunchSettings() {
  if (process.platform !== "win32") {
    return {
      supported: false,
      enabled: false,
    };
  }

  try {
    const loginState = app.getLoginItemSettings();
    return {
      supported: true,
      enabled: Boolean(loginState.openAtLogin),
    };
  } catch {
    return {
      supported: true,
      enabled: false,
    };
  }
}

function setStartupLaunchEnabled(enabled) {
  if (process.platform !== "win32") {
    return getStartupLaunchSettings();
  }

  const desired = Boolean(enabled);
  try {
    app.setLoginItemSettings({
      openAtLogin: desired,
    });
  } catch {
    // Keep returning detected state even when setting fails.
  }

  return getStartupLaunchSettings();
}

ipcMain.handle("library:pick-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Select Songs",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Audio Files",
        extensions: ["mp3", "wav", "ogg", "m4a", "flac", "aac", "wma", "opus", "webm"],
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

ipcMain.handle("playlist:pick-cover", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Select Playlist Cover",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff"],
      },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const coverPath = filePaths[0];

  try {
    const bytes = await fs.readFile(coverPath);
    return fileBufferToImageDataUrl(coverPath, bytes);
  } catch {
    return null;
  }
});

ipcMain.handle("link:resolve", async (_, rawUrl) => resolvePlayableLink(rawUrl));
ipcMain.handle("link:prepare-track", async (_, rawUrl) => prepareLinkTrack(rawUrl));
ipcMain.handle("system:get-startup-launch", async () => getStartupLaunchSettings());
ipcMain.handle("system:set-startup-launch", async (_, enabled) => setStartupLaunchEnabled(enabled));

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
