
const DEFAULT_VOLUME = 0.85;
const REPEAT_MODES = ["off", "all", "one"];
const FILTER_MODES = ["all", "favorites"];
const DEFAULT_PLAYLIST_NAME = "Main Playlist";
const DEFAULT_THEME_ACCENT = "#25d061";
const EMPTY_PLAYLIST_MESSAGE = "No songs in this playlist. Add songs or import a folder.";
const EMPTY_FILTER_MESSAGE = "No songs match the current search or favorite filter.";

const state = {
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
  seeking: false,
  currentTrackDetails: null,
  detailsToken: 0,
  saveTimer: null,
  likedTrackIds: new Set(),
  searchQuery: "",
  filterMode: "all",
  externalTrack: null,
  lastVolumeBeforeMute: DEFAULT_VOLUME,
  dragSourceIndex: -1,
  deleteMode: false,
  trackCoverCache: new Map(),
  trackCoverLoading: new Set(),
  playlistRefreshTimer: null,
  playlistTabMenuOpenId: "",
  settingsOpen: false,
  settings: {
    autoPlayOnStartup: false,
    launchOnStartup: false,
    launchOnStartupSupported: false,
    themeAccent: DEFAULT_THEME_ACCENT,
    outputDeviceId: "",
    outputDevices: [],
  },
  playlistBuilder: {
    open: false,
    name: "",
    searchQuery: "",
    coverDataUrl: null,
    tracks: [],
    selectedTrackIds: new Set(),
    settingsPlaylistId: "default",
    settingsName: "",
  },
};
state.playlist = state.playlists[0].tracks;

const audio = document.getElementById("audio-player");
const addFilesButton = document.getElementById("add-files-btn");
const addFolderButton = document.getElementById("add-folder-btn");
const playLinkButton = document.getElementById("play-link-btn");
const songLinkInput = document.getElementById("song-link-input");
const linkLoaderText = document.getElementById("link-loader-text");
const playButton = document.getElementById("play-btn");
const prevButton = document.getElementById("prev-btn");
const nextButton = document.getElementById("next-btn");
const shuffleButton = document.getElementById("shuffle-btn");
const repeatButton = document.getElementById("repeat-btn");
const likeCurrentButton = document.getElementById("like-current-btn");
const removeButton = document.getElementById("remove-btn");
const clearButton = document.getElementById("clear-btn");
const favoritesFilterButton = document.getElementById("favorites-filter-btn");
const searchInput = document.getElementById("search-input");
const playlistTabs = document.getElementById("playlist-tabs");
const openPlaylistBuilderButton = document.getElementById("open-playlist-builder-btn");
const openSettingsButton = document.getElementById("open-settings-btn");
const deletePlaylistButton = document.getElementById("delete-playlist-btn");
const setPlaylistCoverButton = document.getElementById("set-playlist-cover-btn");
const clearPlaylistCoverButton = document.getElementById("clear-playlist-cover-btn");
const playlistCoverPreview = document.getElementById("playlist-cover-preview");
const playlistCoverImage = document.getElementById("playlist-cover-image");
const playlistCoverFallback = document.getElementById("playlist-cover-fallback");
const playlistBuilderPanel = document.getElementById("playlist-builder-panel");
const builderPlaylistNameInput = document.getElementById("builder-playlist-name-input");
const builderSongSearchInput = document.getElementById("builder-song-search-input");
const builderUseMainListButton = document.getElementById("builder-use-active-playlist-btn");
const builderAddSystemButton = document.getElementById("builder-add-system-btn");
const builderSetCoverButton = document.getElementById("builder-set-cover-btn");
const builderClearCoverButton = document.getElementById("builder-clear-cover-btn");
const builderSongList = document.getElementById("builder-song-list");
const builderEmptyState = document.getElementById("builder-empty-state");
const builderCoverPreview = document.getElementById("builder-cover-preview");
const builderCoverImage = document.getElementById("builder-cover-image");
const builderCoverFallback = document.getElementById("builder-cover-fallback");
const builderCreateButton = document.getElementById("builder-create-btn");
const builderCancelButton = document.getElementById("builder-cancel-btn");
const builderNewPlaylistButton = document.getElementById("builder-new-playlist-btn");
const builderPlaylistList = document.getElementById("builder-playlist-list");
const builderSettingsPanel = document.getElementById("builder-settings-panel");
const builderSettingsNameInput = document.getElementById("builder-settings-name-input");
const builderSettingsOpenButton = document.getElementById("builder-settings-open-btn");
const builderSettingsSetCoverButton = document.getElementById("builder-settings-set-cover-btn");
const builderSettingsClearCoverButton = document.getElementById("builder-settings-clear-cover-btn");
const builderSettingsSaveButton = document.getElementById("builder-settings-save-btn");
const builderSettingsDeleteButton = document.getElementById("builder-settings-delete-btn");
const builderSettingsCoverPreview = document.getElementById("builder-settings-cover-preview");
const builderSettingsCoverImage = document.getElementById("builder-settings-cover-image");
const builderSettingsCoverFallback = document.getElementById("builder-settings-cover-fallback");
const playlistBuilderBackdrop = document.getElementById("playlist-builder-backdrop");
const appSettingsBackdrop = document.getElementById("app-settings-backdrop");
const appSettingsPanel = document.getElementById("app-settings-panel");
const closeSettingsButton = document.getElementById("close-settings-btn");
const settingsAutoplayToggle = document.getElementById("settings-autoplay-toggle");
const settingsStartupToggle = document.getElementById("settings-startup-toggle");
const settingsThemeColorInput = document.getElementById("settings-theme-color-input");
const settingsThemeColorText = document.getElementById("settings-theme-color-text");
const settingsThemeResetButton = document.getElementById("settings-theme-reset-btn");
const settingsOutputDeviceSelect = document.getElementById("settings-output-device-select");
const settingsRefreshDevicesButton = document.getElementById("settings-refresh-devices-btn");
const settingsOutputHint = document.getElementById("settings-output-hint");
const favoritesSummary = document.getElementById("favorites-summary");
const seekSlider = document.getElementById("seek-slider");
const volumeSlider = document.getElementById("volume-slider");
const volumeButton = document.getElementById("volume-btn");
const currentTimeLabel = document.getElementById("current-time");
const durationLabel = document.getElementById("duration");
const trackTitle = document.getElementById("track-title");
const trackSubtitle = document.getElementById("track-subtitle");
const trackPath = document.getElementById("track-path");
const playlistElement = document.getElementById("playlist");
const emptyState = document.getElementById("empty-state");
const coverWrap = document.getElementById("cover-wrap");
const coverImage = document.getElementById("cover-image");
const coverGlow = document.getElementById("cover-glow");
const playIconUse = document.getElementById("play-icon-use");
const volumeIconUse = document.getElementById("volume-icon-use");

const api = window.songPlayerAPI;

function setButtonLabel(button, label) {
  const labelNode = button?.querySelector(".btn-label");
  if (labelNode) {
    labelNode.textContent = label;
    return;
  }

  if (button) {
    button.textContent = label;
  }
}

function setPlayButtonState(isPlaying) {
  setButtonLabel(playButton, isPlaying ? "Pause" : "Play");
  if (playIconUse) {
    playIconUse.setAttribute("href", isPlaying ? "#icon-pause" : "#icon-play");
  }
}

function createIconSvg(iconId, className = "btn-icon") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");

  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${iconId}`);
  svg.appendChild(use);

  return svg;
}

function titleFromPath(filePath) {
  const chunks = String(filePath).split(/[\\/]/);
  const filename = chunks[chunks.length - 1] || "Unknown Song";
  const withoutExt = filename.replace(/\.[^/.]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").trim() || filename;
}

function titleFromUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname || "";
    const tail = pathname.split("/").pop() || parsed.hostname || "Link Song";
    const decoded = decodeURIComponent(tail);
    return decoded.replace(/\.[^/.]+$/, "") || decoded;
  } catch {
    return "Link Song";
  }
}

function normalizeAudioUrl(rawValue) {
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

function normalizeCoverDataUrl(coverDataUrl) {
  if (typeof coverDataUrl !== "string") {
    return null;
  }

  const trimmed = coverDataUrl.trim();
  if (!trimmed.startsWith("data:image/")) {
    return null;
  }

  return trimmed;
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

function hexToRgb(hexColor) {
  const normalized = normalizeThemeAccent(hexColor);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const toChannel = (value) => clampNumber(Math.round(Number(value) || 0), 0, 255).toString(16).padStart(2, "0");
  return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
}

function shiftHexColor(hexColor, delta) {
  const rgb = hexToRgb(hexColor);
  return rgbToHex(rgb.r + delta, rgb.g + delta, rgb.b + delta);
}

function applyThemeAccent(accentColor, persist = true) {
  const normalized = normalizeThemeAccent(accentColor, state.settings.themeAccent || DEFAULT_THEME_ACCENT);
  const accentStrong = shiftHexColor(normalized, -22);
  const scrollThumb = shiftHexColor(normalized, -8);
  const scrollThumbHover = shiftHexColor(normalized, 16);
  const accentRgb = hexToRgb(normalized);
  const accentStrongRgb = hexToRgb(accentStrong);

  document.documentElement.style.setProperty("--accent", normalized);
  document.documentElement.style.setProperty("--accent-strong", accentStrong);
  document.documentElement.style.setProperty("--accent-rgb", `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
  document.documentElement.style.setProperty(
    "--accent-strong-rgb",
    `${accentStrongRgb.r}, ${accentStrongRgb.g}, ${accentStrongRgb.b}`,
  );
  document.documentElement.style.setProperty("--scroll-thumb", scrollThumb);
  document.documentElement.style.setProperty("--scroll-thumb-hover", scrollThumbHover);

  state.settings.themeAccent = normalized;
  if (settingsThemeColorInput) {
    settingsThemeColorInput.value = normalized;
  }
  if (settingsThemeColorText) {
    settingsThemeColorText.value = normalized;
  }

  if (persist) {
    queueStateSave();
  }
}

function isOutputDeviceSelectionSupported() {
  return Boolean(audio && typeof audio.setSinkId === "function");
}

function normalizeSourceType(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "link" ? "link" : "file";
}

function isLinkTrack(track) {
  return normalizeSourceType(track?.sourceType) === "link";
}

function getTrackTitleFallback(track) {
  const sourceUrl = normalizeAudioUrl(track?.sourceUrl || track?.path || "");
  if (sourceUrl) {
    return titleFromUrl(sourceUrl);
  }

  if (typeof track?.path === "string" && track.path.trim()) {
    return titleFromPath(track.path);
  }

  return "Unknown Song";
}

function getTrackCoverDataUrl(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  return normalizeCoverDataUrl(track.coverDataUrl) || normalizeCoverDataUrl(state.trackCoverCache.get(track.id));
}

function getTrackInitials(track) {
  const fallbackTitle = getTrackTitleFallback(track);
  const parts = String(fallbackTitle).trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "S";
  const second = parts[1]?.[0] || parts[0]?.[1] || "G";
  return `${first}${second}`.toUpperCase();
}

function getPlaylistInitials(name) {
  if (typeof name !== "string" || !name.trim()) {
    return "PL";
  }

  const chunks = name.trim().split(/\s+/).filter(Boolean);
  const first = chunks[0]?.[0] || "P";
  const second = chunks[1]?.[0] || chunks[0]?.[1] || "L";
  return `${first}${second}`.toUpperCase();
}

function createPlaylistId() {
  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePlaylistName(name, fallbackName = DEFAULT_PLAYLIST_NAME) {
  if (typeof name === "string" && name.trim()) {
    return name.trim().slice(0, 80);
  }

  return fallbackName;
}

function getActivePlaylist() {
  return state.playlists.find((playlist) => playlist.id === state.activePlaylistId) || state.playlists[0];
}

function syncActivePlaylistReference() {
  const activePlaylist = getActivePlaylist();
  if (!activePlaylist) {
    state.playlists = [{
      id: "default",
      name: DEFAULT_PLAYLIST_NAME,
      tracks: [],
      coverDataUrl: null,
    }];
    state.activePlaylistId = "default";
    state.playlist = state.playlists[0].tracks;
    return state.playlists[0];
  }

  state.activePlaylistId = activePlaylist.id;
  state.playlist = activePlaylist.tracks;
  return activePlaylist;
}

function getActivePlaylistCoverDataUrl() {
  const activePlaylist = getActivePlaylist();
  return normalizeCoverDataUrl(activePlaylist?.coverDataUrl);
}

function setCoverPreview(previewElement, previewImageElement, previewFallbackElement, coverDataUrl, fallbackText) {
  if (!previewElement || !previewImageElement || !previewFallbackElement) {
    return;
  }

  const normalized = normalizeCoverDataUrl(coverDataUrl);
  const safeFallback = typeof fallbackText === "string" && fallbackText.trim() ? fallbackText.trim() : "PL";

  previewFallbackElement.textContent = safeFallback;
  if (!normalized) {
    previewElement.classList.remove("has-cover");
    previewImageElement.removeAttribute("src");
    return;
  }

  previewImageElement.src = normalized;
  previewElement.classList.add("has-cover");
}

function refreshActivePlaylistCoverPreview() {
  const activePlaylist = getActivePlaylist();
  const fallback = getPlaylistInitials(activePlaylist?.name || DEFAULT_PLAYLIST_NAME);
  setCoverPreview(
    playlistCoverPreview,
    playlistCoverImage,
    playlistCoverFallback,
    activePlaylist?.coverDataUrl || null,
    fallback,
  );
}

function collectAllLibraryTracks() {
  const seen = new Set();
  const tracks = [];

  for (const playlist of state.playlists) {
    for (const track of playlist.tracks) {
      if (!track || typeof track.id !== "string" || seen.has(track.id)) {
        continue;
      }
      seen.add(track.id);
      tracks.push(track);
    }
  }

  return tracks;
}

function refreshBuilderCoverPreview() {
  const fallback = getPlaylistInitials(state.playlistBuilder.name || DEFAULT_PLAYLIST_NAME);
  setCoverPreview(
    builderCoverPreview,
    builderCoverImage,
    builderCoverFallback,
    state.playlistBuilder.coverDataUrl,
    fallback,
  );
}

function closePlaylistTabMenu(shouldRender = true) {
  if (!state.playlistTabMenuOpenId) {
    return;
  }

  state.playlistTabMenuOpenId = "";
  if (shouldRender) {
    syncPlaylistTabMenuUi();
  }
}

function syncPlaylistTabMenuUi() {
  const rows = playlistTabs?.querySelectorAll(".playlist-tab-row");
  if (!rows || rows.length === 0) {
    return;
  }

  for (const row of rows) {
    const toggleButton = row.querySelector("button[data-menu-playlist-id]");
    const actionsPanel = row.querySelector(".playlist-tab-actions");
    if (!toggleButton || !actionsPanel) {
      continue;
    }

    const playlistId = toggleButton.dataset.menuPlaylistId;
    const isOpen = typeof playlistId === "string" && playlistId === state.playlistTabMenuOpenId;
    toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    actionsPanel.classList.toggle("is-open", isOpen);
    actionsPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }
}

function resetBuilderDraft(includeLibraryTracks = true) {
  state.playlistBuilder.name = "";
  state.playlistBuilder.searchQuery = "";
  state.playlistBuilder.coverDataUrl = null;
  state.playlistBuilder.selectedTrackIds.clear();
  if (includeLibraryTracks) {
    state.playlistBuilder.tracks = collectAllLibraryTracks();
  }
}

function hostFromUrl(urlValue) {
  try {
    return new URL(urlValue).hostname || "link";
  } catch {
    return "link";
  }
}

function formatPlatformLabel(platform) {
  const normalized = typeof platform === "string" ? platform.trim().toLowerCase() : "";
  if (normalized === "youtube") {
    return "YouTube";
  }
  if (normalized === "soundcloud") {
    return "SoundCloud";
  }
  if (normalized === "direct") {
    return "Direct Link";
  }
  if (normalized) {
    return normalized[0].toUpperCase() + normalized.slice(1);
  }
  return "Direct Link";
}

function setLinkLoadingState(isLoading, message = "Preparing link track...") {
  if (!playLinkButton || !songLinkInput) {
    return;
  }

  playLinkButton.classList.toggle("is-loading", isLoading);
  playLinkButton.disabled = isLoading;
  songLinkInput.disabled = isLoading;
  setButtonLabel(playLinkButton, isLoading ? "Loading..." : "Play Link");

  if (!linkLoaderText) {
    return;
  }

  if (isLoading) {
    linkLoaderText.textContent = message;
    linkLoaderText.hidden = false;
  } else {
    linkLoaderText.textContent = "";
    linkLoaderText.hidden = true;
  }
}

function syncGlobalModalState() {
  document.body.classList.toggle("modal-open", state.playlistBuilder.open || state.settingsOpen);
}

function setOutputHint(message) {
  if (!settingsOutputHint) {
    return;
  }
  settingsOutputHint.textContent = message;
}

function renderOutputDeviceOptions() {
  if (!settingsOutputDeviceSelect) {
    return;
  }

  while (settingsOutputDeviceSelect.firstChild) {
    settingsOutputDeviceSelect.removeChild(settingsOutputDeviceSelect.firstChild);
  }

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "System Default";
  settingsOutputDeviceSelect.appendChild(defaultOption);

  for (const device of state.settings.outputDevices) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || "Audio Device";
    settingsOutputDeviceSelect.appendChild(option);
  }

  const desiredValue = state.settings.outputDeviceId || "";
  const hasDesired = desiredValue === ""
    || state.settings.outputDevices.some((device) => device.deviceId === desiredValue);
  settingsOutputDeviceSelect.value = hasDesired ? desiredValue : "";
}

function renderAppSettingsPanel() {
  if (!appSettingsPanel) {
    return;
  }

  appSettingsPanel.hidden = !state.settingsOpen;
  if (appSettingsBackdrop) {
    appSettingsBackdrop.hidden = !state.settingsOpen;
  }
  openSettingsButton?.classList.toggle("active", state.settingsOpen);
  syncGlobalModalState();

  if (!state.settingsOpen) {
    return;
  }

  if (settingsAutoplayToggle) {
    settingsAutoplayToggle.checked = Boolean(state.settings.autoPlayOnStartup);
  }
  if (settingsStartupToggle) {
    settingsStartupToggle.checked = Boolean(state.settings.launchOnStartup);
    settingsStartupToggle.disabled = !state.settings.launchOnStartupSupported;
    settingsStartupToggle.title = state.settings.launchOnStartupSupported
      ? "Launch app when Windows starts"
      : "This option is only available on Windows.";
  }
  if (settingsThemeColorInput) {
    settingsThemeColorInput.value = normalizeThemeAccent(state.settings.themeAccent);
  }
  if (settingsThemeColorText) {
    settingsThemeColorText.value = normalizeThemeAccent(state.settings.themeAccent);
  }

  renderOutputDeviceOptions();

  if (!isOutputDeviceSelectionSupported()) {
    settingsOutputDeviceSelect?.setAttribute("disabled", "true");
    settingsRefreshDevicesButton?.setAttribute("disabled", "true");
    setOutputHint("Output device selection is not supported in this runtime.");
  } else {
    settingsOutputDeviceSelect?.removeAttribute("disabled");
    settingsRefreshDevicesButton?.removeAttribute("disabled");
    if (!state.settings.outputDeviceId) {
      setOutputHint("Using system default output device.");
    } else {
      const active = state.settings.outputDevices.find((device) => device.deviceId === state.settings.outputDeviceId);
      setOutputHint(active ? `Using ${active.label || "selected device"}.` : "Selected device is unavailable. Falling back to default.");
    }
  }
}

function openAppSettingsPanel() {
  if (state.playlistBuilder.open) {
    closePlaylistBuilderPanel();
  }
  state.settingsOpen = true;
  renderAppSettingsPanel();
}

function closeAppSettingsPanel() {
  state.settingsOpen = false;
  renderAppSettingsPanel();
}

async function refreshOutputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    state.settings.outputDevices = [];
    renderAppSettingsPanel();
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({
        deviceId: device.deviceId || "",
        label: device.label || "",
      }));
    state.settings.outputDevices = outputs;
  } catch {
    state.settings.outputDevices = [];
  }

  if (state.settings.outputDeviceId) {
    const hasSaved = state.settings.outputDevices.some((device) => device.deviceId === state.settings.outputDeviceId);
    if (!hasSaved) {
      state.settings.outputDeviceId = "";
      await applyOutputDevice("", false);
    }
  }

  renderAppSettingsPanel();
}

async function applyOutputDevice(deviceId, persist = true) {
  const targetDeviceId = typeof deviceId === "string" ? deviceId : "";
  if (!isOutputDeviceSelectionSupported()) {
    state.settings.outputDeviceId = "";
    renderAppSettingsPanel();
    return false;
  }

  try {
    await audio.setSinkId(targetDeviceId || "default");
    state.settings.outputDeviceId = targetDeviceId;
    if (persist) {
      queueStateSave();
    }
    renderAppSettingsPanel();
    return true;
  } catch {
    renderAppSettingsPanel();
    setOutputHint("Could not switch output device. Check browser permissions and device availability.");
    return false;
  }
}

async function refreshStartupLaunchSetting() {
  if (!api?.getStartupLaunch) {
    state.settings.launchOnStartupSupported = false;
    state.settings.launchOnStartup = false;
    renderAppSettingsPanel();
    return;
  }

  try {
    const info = await api.getStartupLaunch();
    state.settings.launchOnStartupSupported = Boolean(info?.supported);
    state.settings.launchOnStartup = Boolean(info?.enabled);
  } catch {
    state.settings.launchOnStartupSupported = false;
    state.settings.launchOnStartup = false;
  }

  renderAppSettingsPanel();
}

function getBuilderSettingsPlaylist() {
  const playlistId = state.playlistBuilder.settingsPlaylistId;
  if (typeof playlistId !== "string" || !playlistId) {
    return null;
  }

  return state.playlists.find((playlist) => playlist.id === playlistId) || null;
}

function openBuilderPlaylistSettings(playlistId, focusNameInput = false) {
  const playlist = state.playlists.find((entry) => entry.id === playlistId);
  if (!playlist) {
    return;
  }

  state.playlistBuilder.settingsPlaylistId = playlist.id;
  state.playlistBuilder.settingsName = playlist.name;
  renderPlaylistBuilderPanel();

  if (focusNameInput) {
    builderSettingsNameInput?.focus();
    builderSettingsNameInput?.select();
  }
}

function refreshBuilderSettingsCoverPreview() {
  const playlist = getBuilderSettingsPlaylist();
  if (!playlist) {
    setCoverPreview(
      builderSettingsCoverPreview,
      builderSettingsCoverImage,
      builderSettingsCoverFallback,
      null,
      "PL",
    );
    return;
  }

  setCoverPreview(
    builderSettingsCoverPreview,
    builderSettingsCoverImage,
    builderSettingsCoverFallback,
    playlist.coverDataUrl,
    getPlaylistInitials(playlist.name),
  );
}

function renderBuilderPlaylistList() {
  if (!builderPlaylistList) {
    return;
  }

  while (builderPlaylistList.firstChild) {
    builderPlaylistList.removeChild(builderPlaylistList.firstChild);
  }

  for (const playlist of state.playlists) {
    const row = document.createElement("li");
    row.className = "builder-playlist-item";

    const mainButton = document.createElement("button");
    mainButton.type = "button";
    mainButton.className = "builder-playlist-main";
    mainButton.dataset.playlistId = playlist.id;
    if (playlist.id === state.playlistBuilder.settingsPlaylistId) {
      mainButton.classList.add("active");
    }

    const preview = document.createElement("div");
    preview.className = "playlist-cover-preview";
    preview.title = `${playlist.name} cover`;

    const coverImage = document.createElement("img");
    coverImage.alt = `${playlist.name} cover`;
    const coverFallback = document.createElement("span");

    preview.append(coverImage, coverFallback);
    setCoverPreview(
      preview,
      coverImage,
      coverFallback,
      playlist.coverDataUrl,
      getPlaylistInitials(playlist.name),
    );

    const info = document.createElement("div");
    info.className = "builder-playlist-info";

    const name = document.createElement("div");
    name.className = "builder-playlist-name";
    name.textContent = playlist.name;

    const count = document.createElement("div");
    count.className = "builder-playlist-count";
    count.textContent = `${playlist.tracks.length} song${playlist.tracks.length === 1 ? "" : "s"}`;

    info.append(name, count);
    mainButton.append(preview, info);

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "btn-ghost builder-playlist-settings-btn";
    settingsButton.dataset.settingsPlaylistId = playlist.id;
    settingsButton.title = `Open settings for ${playlist.name}`;
    settingsButton.setAttribute("aria-label", `Open settings for ${playlist.name}`);
    settingsButton.append(createIconSvg("icon-settings"));

    row.append(mainButton, settingsButton);
    builderPlaylistList.appendChild(row);
  }
}

function renderBuilderSettingsPanel() {
  if (!builderSettingsPanel) {
    return;
  }

  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    builderSettingsPanel.hidden = true;
    return;
  }

  builderSettingsPanel.hidden = false;

  if (builderSettingsNameInput && builderSettingsNameInput.value !== state.playlistBuilder.settingsName) {
    builderSettingsNameInput.value = state.playlistBuilder.settingsName;
  }

  refreshBuilderSettingsCoverPreview();

  if (builderSettingsOpenButton) {
    builderSettingsOpenButton.disabled = settingsPlaylist.id === state.activePlaylistId;
  }
  if (builderSettingsClearCoverButton) {
    builderSettingsClearCoverButton.disabled = !normalizeCoverDataUrl(settingsPlaylist.coverDataUrl);
  }
  if (builderSettingsDeleteButton) {
    builderSettingsDeleteButton.disabled = state.playlists.length <= 1;
  }
}

function renderPlaylistBuilderSongList() {
  while (builderSongList?.firstChild) {
    builderSongList.removeChild(builderSongList.firstChild);
  }

  const query = state.playlistBuilder.searchQuery.trim().toLowerCase();
  const candidates = state.playlistBuilder.tracks.filter((track) => {
    if (!query) {
      return true;
    }
    const haystack = `${track.title} ${track.path}`.toLowerCase();
    return haystack.includes(query);
  });

  if (builderEmptyState) {
    if (state.playlistBuilder.tracks.length === 0) {
      builderEmptyState.textContent = "No songs yet. Use \"Use Main List\" or \"Add From System\".";
      builderEmptyState.style.display = "block";
    } else if (candidates.length === 0) {
      builderEmptyState.textContent = "No songs match your search.";
      builderEmptyState.style.display = "block";
    } else {
      builderEmptyState.style.display = "none";
    }
  }

  for (const track of candidates) {
    const row = document.createElement("li");
    row.className = "builder-song-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.playlistBuilder.selectedTrackIds.has(track.id);
    checkbox.dataset.trackId = track.id;

    const meta = document.createElement("div");
    meta.className = "builder-song-meta";

    const title = document.createElement("div");
    title.className = "builder-song-title";
    title.textContent = track.title;

    const filePath = document.createElement("div");
    filePath.className = "builder-song-path";
    filePath.textContent = track.path;

    meta.append(title, filePath);
    row.append(checkbox, meta);
    builderSongList?.appendChild(row);
  }
}

function renderPlaylistBuilderPanel() {
  if (!playlistBuilderPanel) {
    return;
  }

  if (playlistBuilderBackdrop) {
    playlistBuilderBackdrop.hidden = !state.playlistBuilder.open;
  }
  syncGlobalModalState();

  playlistBuilderPanel.hidden = !state.playlistBuilder.open;
  openPlaylistBuilderButton?.setAttribute(
    "aria-label",
    state.playlistBuilder.open ? "Close playlist builder" : "Create playlist",
  );
  openPlaylistBuilderButton?.classList.toggle("active", state.playlistBuilder.open);
  if (!state.playlistBuilder.open) {
    return;
  }

  if (!getBuilderSettingsPlaylist()) {
    const activePlaylist = syncActivePlaylistReference();
    state.playlistBuilder.settingsPlaylistId = activePlaylist.id;
    state.playlistBuilder.settingsName = activePlaylist.name;
  }

  if (builderPlaylistNameInput && builderPlaylistNameInput.value !== state.playlistBuilder.name) {
    builderPlaylistNameInput.value = state.playlistBuilder.name;
  }
  if (builderSongSearchInput && builderSongSearchInput.value !== state.playlistBuilder.searchQuery) {
    builderSongSearchInput.value = state.playlistBuilder.searchQuery;
  }

  renderBuilderPlaylistList();
  renderBuilderSettingsPanel();
  refreshBuilderCoverPreview();
  renderPlaylistBuilderSongList();

  if (builderCreateButton) {
    builderCreateButton.disabled = state.playlistBuilder.selectedTrackIds.size === 0;
  }
}

function openPlaylistBuilderPanel() {
  if (state.settingsOpen) {
    closeAppSettingsPanel();
  }

  state.playlistBuilder.open = true;
  resetBuilderDraft(true);

  const activePlaylist = syncActivePlaylistReference();
  state.playlistBuilder.settingsPlaylistId = activePlaylist.id;
  state.playlistBuilder.settingsName = activePlaylist.name;

  renderPlaylistBuilderPanel();
  builderPlaylistNameInput?.focus();
}

function closePlaylistBuilderPanel() {
  state.playlistBuilder.open = false;
  renderPlaylistBuilderPanel();
}

function mergeBuilderTracks(tracks, selectNewTracks = false) {
  const safeTracks = Array.isArray(tracks) ? tracks.map(sanitizeTrack).filter(Boolean) : [];
  if (safeTracks.length === 0) {
    return;
  }

  const existing = new Set(state.playlistBuilder.tracks.map((track) => track.id));
  for (const track of safeTracks) {
    if (existing.has(track.id)) {
      continue;
    }
    existing.add(track.id);
    state.playlistBuilder.tracks.push(track);
    if (selectNewTracks) {
      state.playlistBuilder.selectedTrackIds.add(track.id);
    }
  }
}

function syncBuilderTracksWithLibrary() {
  if (state.playlistBuilder.open) {
    mergeBuilderTracks(collectAllLibraryTracks(), false);
    const availableIds = new Set(state.playlistBuilder.tracks.map((track) => track.id));
    for (const selectedId of state.playlistBuilder.selectedTrackIds) {
      if (!availableIds.has(selectedId)) {
        state.playlistBuilder.selectedTrackIds.delete(selectedId);
      }
    }
  }

  const hasSettingsPlaylist = state.playlists.some((playlist) => playlist.id === state.playlistBuilder.settingsPlaylistId);
  if (!hasSettingsPlaylist) {
    const fallbackPlaylist = getActivePlaylist() || state.playlists[0] || null;
    state.playlistBuilder.settingsPlaylistId = fallbackPlaylist ? fallbackPlaylist.id : "";
    state.playlistBuilder.settingsName = fallbackPlaylist ? fallbackPlaylist.name : "";
    return;
  }

  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    return;
  }

  if (builderSettingsNameInput && document.activeElement === builderSettingsNameInput) {
    return;
  }

  if (state.playlistBuilder.settingsName !== settingsPlaylist.name) {
    state.playlistBuilder.settingsName = settingsPlaylist.name;
  }
}

function useMainListForBuilder() {
  const activePlaylist = syncActivePlaylistReference();
  mergeBuilderTracks(activePlaylist.tracks, false);

  for (const track of activePlaylist.tracks) {
    state.playlistBuilder.selectedTrackIds.add(track.id);
  }

  renderPlaylistBuilderPanel();
}

async function addBuilderSongsFromSystem() {
  if (!api?.pickFiles) {
    return;
  }

  const pickedTracks = await api.pickFiles();
  mergeBuilderTracks(pickedTracks, true);
  renderPlaylistBuilderPanel();
}

async function setBuilderCoverFromSystem() {
  if (!api?.pickPlaylistCover) {
    return;
  }

  const coverDataUrl = normalizeCoverDataUrl(await api.pickPlaylistCover());
  if (!coverDataUrl) {
    return;
  }

  state.playlistBuilder.coverDataUrl = coverDataUrl;
  renderPlaylistBuilderPanel();
}

function clearBuilderCover() {
  state.playlistBuilder.coverDataUrl = null;
  renderPlaylistBuilderPanel();
}

function startBuilderNewPlaylist() {
  resetBuilderDraft(true);
  renderPlaylistBuilderPanel();
  builderPlaylistNameInput?.focus();
}

function trackExistsInAnyPlaylist(trackId) {
  if (typeof trackId !== "string" || !trackId) {
    return false;
  }

  for (const playlist of state.playlists) {
    if (playlist.tracks.some((track) => track.id === trackId)) {
      return true;
    }
  }

  return false;
}

function removeMissingFavorites() {
  const allTrackIds = new Set();
  for (const playlist of state.playlists) {
    for (const track of playlist.tracks) {
      allTrackIds.add(track.id);
    }
  }

  for (const likedId of state.likedTrackIds) {
    if (!allTrackIds.has(likedId)) {
      state.likedTrackIds.delete(likedId);
    }
  }
}

function isValidIndex(index, length = state.playlist.length) {
  return Number.isInteger(index) && index >= 0 && index < length;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function clampNumber(value, minimum, maximum) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function sanitizeTrack(track) {
  if (!track || typeof track !== "object" || typeof track.path !== "string" || typeof track.fileUrl !== "string") {
    return null;
  }

  const sourceType = normalizeSourceType(track.sourceType);
  const normalizedSourceUrl = normalizeAudioUrl(track.sourceUrl || track.path || "");
  const sourceUrl = sourceType === "link" ? (normalizedSourceUrl || "") : "";
  const sourceHost = sourceType === "link"
    ? (typeof track.sourceHost === "string" && track.sourceHost.trim() ? track.sourceHost.trim() : hostFromUrl(sourceUrl || track.path))
    : "";
  const sourcePlatform = sourceType === "link"
    ? (typeof track.sourcePlatform === "string" && track.sourcePlatform.trim() ? track.sourcePlatform.trim().toLowerCase() : "link")
    : "file";
  const coverDataUrl = normalizeCoverDataUrl(track.coverDataUrl);
  const artist = typeof track.artist === "string" ? track.artist.trim().slice(0, 140) : "";
  const album = typeof track.album === "string" ? track.album.trim().slice(0, 140) : "";
  const cachedFilePath = typeof track.cachedFilePath === "string" ? track.cachedFilePath.trim() : "";
  const title = typeof track.title === "string" && track.title.trim()
    ? track.title.trim()
    : getTrackTitleFallback(track);

  return {
    id: typeof track.id === "string" && track.id ? track.id : (sourceUrl || track.path),
    path: sourceType === "link" && sourceUrl ? sourceUrl : track.path,
    title,
    fileUrl: track.fileUrl,
    sourceType,
    sourceUrl,
    sourceHost,
    sourcePlatform,
    cachedFilePath,
    coverDataUrl,
    artist,
    album,
  };
}

function sanitizePlaylist(playlist, fallbackId, fallbackName) {
  const safeName = sanitizePlaylistName(playlist?.name, fallbackName);
  const rawTracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
  const safeTracks = rawTracks.map(sanitizeTrack).filter(Boolean);
  const rawId = typeof playlist?.id === "string" && playlist.id.trim() ? playlist.id.trim() : fallbackId;
  const safeId = rawId.slice(0, 80) || fallbackId;
  const coverDataUrl = normalizeCoverDataUrl(playlist?.coverDataUrl);

  return {
    id: safeId,
    name: safeName,
    tracks: safeTracks,
    coverDataUrl,
  };
}

function normalizeRestoredPlaylists(savedState) {
  const rawPlaylists = Array.isArray(savedState?.playlists) && savedState.playlists.length > 0
    ? savedState.playlists
    : [{
      id: "default",
      name: DEFAULT_PLAYLIST_NAME,
      tracks: Array.isArray(savedState?.playlist) ? savedState.playlist : [],
      coverDataUrl: null,
    }];

  const playlists = [];
  const usedIds = new Set();

  for (let index = 0; index < rawPlaylists.length; index += 1) {
    const fallbackId = index === 0 ? "default" : `playlist-${index + 1}`;
    const fallbackName = index === 0 ? DEFAULT_PLAYLIST_NAME : `Playlist ${index + 1}`;
    const normalized = sanitizePlaylist(rawPlaylists[index], fallbackId, fallbackName);

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

  const safePlaylists = playlists.length > 0
    ? playlists
    : [{
      id: "default",
      name: DEFAULT_PLAYLIST_NAME,
      tracks: [],
      coverDataUrl: null,
    }];

  const requestedActiveId = typeof savedState?.activePlaylistId === "string"
    ? savedState.activePlaylistId
    : safePlaylists[0].id;
  const activePlaylist = safePlaylists.find((playlist) => playlist.id === requestedActiveId) || safePlaylists[0];

  return {
    playlists: safePlaylists,
    activePlaylistId: activePlaylist.id,
  };
}

function renderPlaylistTabs() {
  while (playlistTabs.firstChild) {
    playlistTabs.removeChild(playlistTabs.firstChild);
  }

  for (const playlist of state.playlists) {
    const row = document.createElement("div");
    row.className = "playlist-tab-row";

    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = "playlist-tab";
    tabButton.dataset.playlistId = playlist.id;
    if (playlist.id === state.activePlaylistId) {
      tabButton.classList.add("active");
    }

    const preview = document.createElement("div");
    preview.className = "playlist-cover-preview";
    preview.title = `${playlist.name} cover`;

    const previewImage = document.createElement("img");
    previewImage.alt = `${playlist.name} cover`;
    const previewFallback = document.createElement("span");

    preview.append(previewImage, previewFallback);
    setCoverPreview(
      preview,
      previewImage,
      previewFallback,
      playlist.coverDataUrl,
      getPlaylistInitials(playlist.name),
    );

    const meta = document.createElement("div");
    meta.className = "playlist-tab-meta";

    const name = document.createElement("div");
    name.className = "playlist-tab-name";
    name.textContent = playlist.name;

    const count = document.createElement("div");
    count.className = "playlist-tab-count";
    count.textContent = `${playlist.tracks.length} song${playlist.tracks.length === 1 ? "" : "s"}`;

    meta.append(name, count);
    tabButton.append(preview, meta);

    const menuToggleButton = document.createElement("button");
    menuToggleButton.type = "button";
    menuToggleButton.className = "btn-ghost icon-only playlist-tab-menu-toggle";
    menuToggleButton.dataset.menuPlaylistId = playlist.id;
    menuToggleButton.setAttribute("aria-label", `More options for ${playlist.name}`);
    menuToggleButton.setAttribute("aria-expanded", state.playlistTabMenuOpenId === playlist.id ? "true" : "false");
    menuToggleButton.title = "More options";
    menuToggleButton.append(createIconSvg("icon-more"));

    const menuActions = document.createElement("div");
    menuActions.className = "playlist-tab-actions";
    const isMenuOpen = state.playlistTabMenuOpenId === playlist.id;
    menuActions.classList.toggle("is-open", isMenuOpen);
    menuActions.setAttribute("aria-hidden", isMenuOpen ? "false" : "true");

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-danger playlist-tab-delete-btn";
    deleteButton.dataset.deletePlaylistId = playlist.id;
    deleteButton.disabled = state.playlists.length <= 1;
    deleteButton.append(createIconSvg("icon-trash"));
    const deleteLabel = document.createElement("span");
    deleteLabel.className = "btn-label";
    deleteLabel.textContent = "Delete Playlist";
    deleteButton.appendChild(deleteLabel);

    menuActions.appendChild(deleteButton);
    row.append(tabButton, menuToggleButton, menuActions);
    playlistTabs.appendChild(row);
  }

  syncPlaylistTabMenuUi();
  refreshActivePlaylistCoverPreview();
}

function activatePlaylist(playlistId, persistState = true) {
  const nextPlaylist = state.playlists.find((playlist) => playlist.id === playlistId);
  if (!nextPlaylist) {
    return;
  }

  if (state.playlistTabMenuOpenId && state.playlistTabMenuOpenId !== nextPlaylist.id) {
    state.playlistTabMenuOpenId = "";
  }

  const isSamePlaylist = state.activePlaylistId === nextPlaylist.id;
  state.activePlaylistId = nextPlaylist.id;
  syncActivePlaylistReference();

  if (!isSamePlaylist) {
    state.currentIndex = -1;
    state.selectedIndex = -1;
    state.detailsToken += 1;

    if (!state.externalTrack) {
      resetPlaybackUi(true);
      updateNowPlayingMeta();
    }
  }

  renderPlaylistTabs();
  renderPlaylist();
  if (state.playlistBuilder.open) {
    renderPlaylistBuilderPanel();
  }

  if (persistState) {
    queueStateSave();
  }
}

function createPlaylist(playlistInput = {}) {
  const fallbackName = `Playlist ${state.playlists.length + 1}`;
  const playlistName = sanitizePlaylistName(playlistInput.name, fallbackName);
  const playlistTracks = Array.isArray(playlistInput.tracks)
    ? playlistInput.tracks.map(sanitizeTrack).filter(Boolean)
    : [];
  const playlistCover = normalizeCoverDataUrl(playlistInput.coverDataUrl);

  const newPlaylist = {
    id: createPlaylistId(),
    name: playlistName,
    tracks: playlistTracks,
    coverDataUrl: playlistCover,
  };

  state.playlists.push(newPlaylist);
  activatePlaylist(newPlaylist.id, true);
  return newPlaylist;
}

async function setActivePlaylistCoverFromSystem() {
  if (!api?.pickPlaylistCover) {
    return;
  }

  const coverDataUrl = normalizeCoverDataUrl(await api.pickPlaylistCover());
  if (!coverDataUrl) {
    return;
  }

  const activePlaylist = syncActivePlaylistReference();
  activePlaylist.coverDataUrl = coverDataUrl;
  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  if (state.currentIndex < 0 && !state.externalTrack) {
    applyCover(coverDataUrl);
  }
  queueStateSave();
}

function clearActivePlaylistCover() {
  const activePlaylist = syncActivePlaylistReference();
  activePlaylist.coverDataUrl = null;
  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  if (state.currentIndex < 0 && !state.externalTrack) {
    resetCover();
  }
  queueStateSave();
}

function updateBuilderSettingsSelectionAfterDelete(deletedIndex) {
  if (state.playlists.length === 0) {
    state.playlistBuilder.settingsPlaylistId = "";
    state.playlistBuilder.settingsName = "";
    return;
  }

  const fallbackIndex = Math.min(deletedIndex, state.playlists.length - 1);
  const fallbackPlaylist = state.playlists[fallbackIndex] || state.playlists[0];
  state.playlistBuilder.settingsPlaylistId = fallbackPlaylist.id;
  state.playlistBuilder.settingsName = fallbackPlaylist.name;
}

function deletePlaylistById(playlistId, persistState = true) {
  if (state.playlists.length <= 1) {
    return false;
  }

  const deleteIndex = state.playlists.findIndex((playlist) => playlist.id === playlistId);
  if (deleteIndex < 0) {
    return false;
  }

  if (state.playlistTabMenuOpenId === playlistId) {
    state.playlistTabMenuOpenId = "";
  }

  const deletingActive = state.activePlaylistId === playlistId;
  state.playlists.splice(deleteIndex, 1);
  removeMissingFavorites();
  syncBuilderTracksWithLibrary();
  updateBuilderSettingsSelectionAfterDelete(deleteIndex);

  if (deletingActive) {
    const nextIndex = Math.min(deleteIndex, state.playlists.length - 1);
    const nextPlaylistId = state.playlists[nextIndex]?.id || state.playlists[0]?.id || "default";
    activatePlaylist(nextPlaylistId, persistState);
    return true;
  }

  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  renderPlaylist();
  if (persistState) {
    queueStateSave();
  }
  return true;
}

function createPlaylistFromBuilder() {
  const fallbackName = `Playlist ${state.playlists.length + 1}`;
  const rawName = builderPlaylistNameInput?.value || state.playlistBuilder.name;
  const selectedTracks = state.playlistBuilder.tracks.filter((track) => state.playlistBuilder.selectedTrackIds.has(track.id));

  if (selectedTracks.length === 0) {
    return;
  }

  const createdPlaylist = createPlaylist({
    name: sanitizePlaylistName(rawName, fallbackName),
    tracks: selectedTracks,
    coverDataUrl: state.playlistBuilder.coverDataUrl,
  });

  if (createdPlaylist) {
    state.playlistBuilder.settingsPlaylistId = createdPlaylist.id;
    state.playlistBuilder.settingsName = createdPlaylist.name;
  }

  closePlaylistBuilderPanel();
}

function deleteActivePlaylist() {
  const activePlaylist = getActivePlaylist();
  if (!activePlaylist) {
    return;
  }

  deletePlaylistById(activePlaylist.id, true);
}

function saveBuilderPlaylistSettings() {
  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    return;
  }

  const nextName = sanitizePlaylistName(
    builderSettingsNameInput?.value || state.playlistBuilder.settingsName,
    settingsPlaylist.name,
  );

  settingsPlaylist.name = nextName;
  state.playlistBuilder.settingsName = nextName;
  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  queueStateSave();
}

function openBuilderSettingsPlaylist() {
  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    return;
  }

  activatePlaylist(settingsPlaylist.id, true);
}

async function setBuilderSettingsPlaylistCoverFromSystem() {
  if (!api?.pickPlaylistCover) {
    return;
  }

  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    return;
  }

  const coverDataUrl = normalizeCoverDataUrl(await api.pickPlaylistCover());
  if (!coverDataUrl) {
    return;
  }

  settingsPlaylist.coverDataUrl = coverDataUrl;
  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  if (settingsPlaylist.id === state.activePlaylistId && state.currentIndex < 0 && !state.externalTrack) {
    applyCover(coverDataUrl);
  }
  queueStateSave();
}

function clearBuilderSettingsPlaylistCover() {
  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    return;
  }

  settingsPlaylist.coverDataUrl = null;
  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  if (settingsPlaylist.id === state.activePlaylistId && state.currentIndex < 0 && !state.externalTrack) {
    resetCover();
  }
  queueStateSave();
}

function deleteBuilderSettingsPlaylist() {
  const settingsPlaylist = getBuilderSettingsPlaylist();
  if (!settingsPlaylist) {
    return;
  }

  deletePlaylistById(settingsPlaylist.id, true);
}

function isTrackLiked(trackId) {
  return typeof trackId === "string" && state.likedTrackIds.has(trackId);
}

function cleanFavoriteIds() {
  removeMissingFavorites();
}

function serializeState() {
  cleanFavoriteIds();
  const activePlaylist = syncActivePlaylistReference();

  return {
    playlists: state.playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      tracks: playlist.tracks,
      coverDataUrl: normalizeCoverDataUrl(playlist.coverDataUrl),
    })),
    activePlaylistId: state.activePlaylistId,
    playlist: activePlaylist.tracks,
    currentIndex: state.currentIndex,
    selectedIndex: state.selectedIndex,
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    volume: clampNumber(Number(volumeSlider.value), 0, 1),
    likedTrackIds: [...state.likedTrackIds],
    filterMode: state.filterMode,
    searchQuery: state.searchQuery,
    settings: {
      autoPlayOnStartup: Boolean(state.settings.autoPlayOnStartup),
      themeAccent: normalizeThemeAccent(state.settings.themeAccent),
      outputDeviceId: typeof state.settings.outputDeviceId === "string" ? state.settings.outputDeviceId : "",
    },
  };
}

function queueStateSave() {
  if (!api?.saveState) {
    return;
  }

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  state.saveTimer = setTimeout(() => {
    api.saveState(serializeState()).catch(() => {});
    state.saveTimer = null;
  }, 260);
}

async function flushStateSave() {
  if (!api?.saveState) {
    return;
  }

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }

  try {
    await api.saveState(serializeState());
  } catch {
    // Keep player usable even when persistence fails.
  }
}

function resetCover() {
  coverImage.onload = null;
  coverImage.onerror = null;
  coverWrap.classList.remove("has-cover");
  coverImage.removeAttribute("src");
  coverGlow.style.backgroundImage = "";
}

function applyCover(coverDataUrl) {
  const normalizedCover = typeof coverDataUrl === "string" ? coverDataUrl.trim() : "";
  const isValidCover = normalizedCover.startsWith("data:image/");

  if (!isValidCover) {
    resetCover();
    return;
  }

  resetCover();
  const probeImage = new Image();
  probeImage.onload = () => {
    coverWrap.classList.add("has-cover");
    coverImage.src = normalizedCover;
    coverGlow.style.backgroundImage = `url("${normalizedCover}")`;
  };
  probeImage.onerror = () => {
    resetCover();
  };
  probeImage.src = normalizedCover;
}

function updateVolumeIcon() {
  const value = clampNumber(Number(volumeSlider.value), 0, 1);
  let iconId = "#icon-volume-high";

  if (value === 0) {
    iconId = "#icon-volume-mute";
  } else if (value < 0.5) {
    iconId = "#icon-volume-low";
  }

  volumeIconUse.setAttribute("href", iconId);
  volumeButton.setAttribute("aria-label", value === 0 ? "Unmute" : "Mute");
}

function setVolume(value, persist = true) {
  const normalized = clampNumber(Number(value), 0, 1);
  volumeSlider.value = String(normalized);
  audio.volume = normalized;

  if (normalized > 0) {
    state.lastVolumeBeforeMute = normalized;
  }

  updateVolumeIcon();

  if (persist) {
    queueStateSave();
  }
}

function toggleMute() {
  const current = clampNumber(Number(volumeSlider.value), 0, 1);
  if (current === 0) {
    const restored = state.lastVolumeBeforeMute > 0 ? state.lastVolumeBeforeMute : DEFAULT_VOLUME;
    setVolume(restored, true);
    return;
  }

  state.lastVolumeBeforeMute = current;
  setVolume(0, true);
}

function updateNowPlayingMeta() {
  if (state.externalTrack) {
    trackTitle.textContent = state.externalTrack.title;
    if (state.externalTrack.warning) {
      trackSubtitle.textContent = state.externalTrack.warning;
    } else {
      const sourceLabel = formatPlatformLabel(state.externalTrack.platform);
      const streamLabel = state.externalTrack.resolved ? `${sourceLabel} Stream` : sourceLabel;
      trackSubtitle.textContent = `${streamLabel} - ${state.externalTrack.host}`;
    }
    trackPath.textContent = state.externalTrack.url;
    return;
  }

  const currentTrack = state.playlist[state.currentIndex];

  if (!currentTrack) {
    trackTitle.textContent = "No song loaded";
    trackSubtitle.textContent = "Import songs to start listening.";
    trackPath.textContent = "-";
    return;
  }

  trackTitle.textContent = currentTrack.title;
  trackPath.textContent = isLinkTrack(currentTrack)
    ? (currentTrack.sourceUrl || currentTrack.path)
    : currentTrack.path;

  if (!state.currentTrackDetails) {
    if (isLinkTrack(currentTrack)) {
      const sourceLabel = formatPlatformLabel(currentTrack.sourcePlatform);
      const sourceHost = currentTrack.sourceHost || hostFromUrl(currentTrack.sourceUrl || currentTrack.path);
      trackSubtitle.textContent = `${sourceLabel} - ${sourceHost}`;
      return;
    }
    trackSubtitle.textContent = "Loading track details...";
    return;
  }

  const artist = state.currentTrackDetails.artist || "Unknown artist";
  const album = state.currentTrackDetails.album;
  trackSubtitle.textContent = album ? `${artist} - ${album}` : artist;
}

function updateCurrentLikeButton() {
  if (state.externalTrack || !isValidIndex(state.currentIndex)) {
    likeCurrentButton.disabled = true;
    setButtonLabel(likeCurrentButton, "Like");
    likeCurrentButton.classList.remove("active");
    return;
  }

  const currentTrack = state.playlist[state.currentIndex];
  const liked = isTrackLiked(currentTrack.id);

  likeCurrentButton.disabled = false;
  setButtonLabel(likeCurrentButton, liked ? "Liked" : "Like");
  likeCurrentButton.classList.toggle("active", liked);
}

function updateFavoritesSummary() {
  cleanFavoriteIds();
  const favoriteCount = state.likedTrackIds.size;
  favoritesSummary.textContent = `${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"}`;
}

function updateFavoriteFilterButton() {
  const favoritesOnly = state.filterMode === "favorites";
  favoritesFilterButton.classList.toggle("active", favoritesOnly);
  setButtonLabel(favoritesFilterButton, favoritesOnly ? "Favorites Only" : "All Songs");
}

function updateControlState() {
  const hasTracks = state.playlist.length > 0;
  const hasSource = hasTracks || Boolean(state.externalTrack) || Boolean(audio.src);

  if (!hasTracks && state.deleteMode) {
    state.deleteMode = false;
  }

  playButton.disabled = !hasSource;
  prevButton.disabled = !hasTracks;
  nextButton.disabled = !hasTracks;
  shuffleButton.disabled = !hasTracks;
  repeatButton.disabled = !hasTracks;
  removeButton.disabled = !hasTracks;
  removeButton.classList.toggle("active", state.deleteMode && hasTracks);
  removeButton.setAttribute("aria-label", state.deleteMode ? "Exit song delete mode" : "Enter song delete mode");
  removeButton.title = state.deleteMode ? "Exit song delete mode" : "Delete songs";
  clearButton.disabled = !hasTracks;
  searchInput.disabled = !hasTracks;
  favoritesFilterButton.disabled = !hasTracks;
  if (deletePlaylistButton) {
    deletePlaylistButton.disabled = state.playlists.length <= 1;
  }
  if (clearPlaylistCoverButton) {
    clearPlaylistCoverButton.disabled = !Boolean(getActivePlaylistCoverDataUrl());
  }
  if (setPlaylistCoverButton) {
    setPlaylistCoverButton.disabled = !api?.pickPlaylistCover;
  }
  if (openPlaylistBuilderButton) {
    openPlaylistBuilderButton.disabled = false;
  }
}

function updateModeButtons() {
  shuffleButton.classList.toggle("active", state.shuffleEnabled);
  setButtonLabel(shuffleButton, state.shuffleEnabled ? "Shuffle On" : "Shuffle Off");

  if (state.repeatMode === "off") {
    setButtonLabel(repeatButton, "Repeat Off");
  }
  if (state.repeatMode === "all") {
    setButtonLabel(repeatButton, "Repeat All");
  }
  if (state.repeatMode === "one") {
    setButtonLabel(repeatButton, "Repeat One");
  }

  repeatButton.classList.toggle("active", state.repeatMode !== "off");
}

function getVisibleTrackIndexes() {
  const query = state.searchQuery.trim().toLowerCase();
  const onlyFavorites = state.filterMode === "favorites";
  const visibleIndexes = [];

  for (let index = 0; index < state.playlist.length; index += 1) {
    const track = state.playlist[index];
    const liked = isTrackLiked(track.id);
    if (onlyFavorites && !liked) {
      continue;
    }

    if (query) {
      const haystack = `${track.title} ${track.path} ${track.sourceHost || ""} ${track.sourceUrl || ""}`.toLowerCase();
      if (!haystack.includes(query)) {
        continue;
      }
    }

    visibleIndexes.push(index);
  }

  return visibleIndexes;
}

function clearDragIndicators() {
  const items = playlistElement.querySelectorAll(".song-item");
  for (const item of items) {
    item.classList.remove("dragging", "drag-over-before", "drag-over-after");
  }
}

function renderPlaylist() {
  while (playlistElement.firstChild) {
    playlistElement.removeChild(playlistElement.firstChild);
  }
  playlistElement.classList.toggle("delete-mode", state.deleteMode);

  const visibleIndexes = getVisibleTrackIndexes();

  for (const index of visibleIndexes) {
    const track = state.playlist[index];
    const item = document.createElement("li");
    item.className = "song-item";
    item.dataset.index = String(index);

    const topRow = document.createElement("div");
    topRow.className = "song-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "song-title-wrap";

    const dragIcon = createIconSvg("icon-drag", "song-drag");
    const songCover = document.createElement("div");
    songCover.className = "song-cover";

    const coverImage = document.createElement("img");
    coverImage.alt = `${track.title} cover`;
    const coverFallback = document.createElement("span");
    coverFallback.textContent = getTrackInitials(track);
    const coverDataUrl = getTrackCoverDataUrl(track);
    if (coverDataUrl) {
      songCover.classList.add("has-cover");
      coverImage.src = coverDataUrl;
    } else {
      coverImage.removeAttribute("src");
    }
    songCover.append(coverImage, coverFallback);

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = track.title;

    titleWrap.append(songCover, title);

    const songActions = document.createElement("div");
    songActions.className = "song-actions";

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "song-like-btn";
    likeButton.dataset.index = String(index);

    const liked = isTrackLiked(track.id);
    if (liked) {
      likeButton.classList.add("active");
    }

    const likeIcon = createIconSvg("icon-heart");
    const likeLabel = document.createElement("span");
    likeLabel.className = "btn-label";
    likeLabel.textContent = liked ? "Liked" : "Like";
    likeButton.append(likeIcon, likeLabel);
    songActions.appendChild(likeButton);

    if (state.deleteMode) {
      const deleteTrackButton = document.createElement("button");
      deleteTrackButton.type = "button";
      deleteTrackButton.className = "song-delete-btn";
      deleteTrackButton.dataset.index = String(index);
      deleteTrackButton.title = `Delete ${track.title}`;
      deleteTrackButton.setAttribute("aria-label", `Delete ${track.title}`);
      deleteTrackButton.append(createIconSvg("icon-trash"));
      songActions.appendChild(deleteTrackButton);
    }

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "song-drag-handle";
    dragHandle.dataset.index = String(index);
    dragHandle.draggable = true;
    dragHandle.title = "Drag to reorder";
    dragHandle.setAttribute("aria-label", "Drag to reorder");
    dragHandle.append(dragIcon);
    songActions.appendChild(dragHandle);

    const filePath = document.createElement("div");
    filePath.className = "song-path";
    filePath.textContent = isLinkTrack(track) ? (track.sourceUrl || track.path) : track.path;

    topRow.append(titleWrap, songActions);
    item.append(topRow, filePath);

    if (index === state.currentIndex && !state.externalTrack) {
      item.classList.add("active");
    }
    if (index === state.selectedIndex) {
      item.classList.add("selected");
    }

    playlistElement.appendChild(item);
  }

  if (state.playlist.length === 0) {
    emptyState.textContent = EMPTY_PLAYLIST_MESSAGE;
    emptyState.style.display = "block";
  } else if (visibleIndexes.length === 0) {
    emptyState.textContent = EMPTY_FILTER_MESSAGE;
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
  }

  updateFavoritesSummary();
  updateFavoriteFilterButton();
  updateCurrentLikeButton();
  updateControlState();
}

function toggleTrackLikeByIndex(index) {
  if (!isValidIndex(index)) {
    return;
  }

  const track = state.playlist[index];
  if (isTrackLiked(track.id)) {
    state.likedTrackIds.delete(track.id);
  } else {
    state.likedTrackIds.add(track.id);
  }

  renderPlaylist();
  queueStateSave();
}

async function hydrateCurrentTrackDetails(expectedIndex) {
  if (state.externalTrack) {
    return;
  }

  const currentTrack = state.playlist[expectedIndex];
  if (!currentTrack) {
    state.currentTrackDetails = null;
    applyCover(getActivePlaylistCoverDataUrl());
    updateNowPlayingMeta();
    return;
  }

  if (isLinkTrack(currentTrack)) {
    const sourceLabel = formatPlatformLabel(currentTrack.sourcePlatform);
    state.currentTrackDetails = {
      artist: currentTrack.artist || sourceLabel,
      album: currentTrack.album || currentTrack.sourceHost || "",
    };
    applyCover(getTrackCoverDataUrl(currentTrack) || getActivePlaylistCoverDataUrl());
    updateNowPlayingMeta();
    return;
  }

  if (!api?.getTrackDetails) {
    state.currentTrackDetails = { artist: "Unknown artist", album: "" };
    applyCover(getActivePlaylistCoverDataUrl());
    updateNowPlayingMeta();
    return;
  }

  const requestToken = ++state.detailsToken;

  let details = null;
  try {
    details = await api.getTrackDetails(currentTrack.path);
  } catch {
    details = null;
  }

  if (requestToken !== state.detailsToken || expectedIndex !== state.currentIndex || state.externalTrack) {
    return;
  }

  if (!details || typeof details !== "object") {
    state.currentTrackDetails = { artist: "Unknown artist", album: "" };
    applyCover(getActivePlaylistCoverDataUrl());
    updateNowPlayingMeta();
    return;
  }

  const nextTitle = typeof details.title === "string" && details.title.trim() ? details.title.trim() : currentTrack.title;
  const nextArtist = typeof details.artist === "string" && details.artist.trim() ? details.artist.trim() : "Unknown artist";
  const nextAlbum = typeof details.album === "string" ? details.album.trim() : "";

  state.currentTrackDetails = {
    artist: nextArtist,
    album: nextAlbum,
  };

  if (nextTitle !== currentTrack.title) {
    currentTrack.title = nextTitle;
    renderPlaylist();
    queueStateSave();
  }

  const normalizedTrackCover = normalizeCoverDataUrl(details.coverDataUrl);
  if (normalizedTrackCover) {
    state.trackCoverCache.set(currentTrack.id, normalizedTrackCover);
    currentTrack.coverDataUrl = normalizedTrackCover;
    renderPlaylist();
    queueStateSave();
  }

  applyCover(normalizedTrackCover || getActivePlaylistCoverDataUrl());
  updateNowPlayingMeta();
}

function applyTrack(index, shouldPlay = false, persistState = true) {
  if (!isValidIndex(index)) {
    return;
  }

  state.externalTrack = null;
  state.detailsToken += 1;
  state.currentIndex = index;
  state.currentTrackDetails = null;

  const track = state.playlist[index];
  const activePlaylistCover = getActivePlaylistCoverDataUrl();
  const explicitTrackCover = getTrackCoverDataUrl(track);
  if (explicitTrackCover) {
    state.trackCoverCache.set(track.id, explicitTrackCover);
  }
  applyCover(explicitTrackCover || activePlaylistCover);
  audio.src = track.fileUrl;
  audio.load();

  if (isLinkTrack(track)) {
    const sourceLabel = formatPlatformLabel(track.sourcePlatform);
    state.currentTrackDetails = {
      artist: track.artist || sourceLabel,
      album: track.album || track.sourceHost || "",
    };
  }

  if (shouldPlay) {
    audio.play().catch(() => {
      setPlayButtonState(false);
    });
  }

  setPlayButtonState(shouldPlay);
  updateNowPlayingMeta();
  renderPlaylist();
  if (!isLinkTrack(track)) {
    hydrateCurrentTrackDetails(index);
  }

  if (persistState) {
    queueStateSave();
  }
}

async function playFromLink() {
  if (playLinkButton?.classList.contains("is-loading")) {
    return;
  }

  const sourceUrl = normalizeAudioUrl(songLinkInput.value);
  if (!sourceUrl) {
    trackSubtitle.textContent = "Enter a valid http(s) audio link.";
    return;
  }

  setLinkLoadingState(true, "Resolving link...");
  trackSubtitle.textContent = "Preparing link track...";

  try {
    let preparedTrack = null;
    if (api?.prepareLinkTrack) {
      try {
        setLinkLoadingState(true, "Caching audio and fetching cover...");
        preparedTrack = sanitizeTrack(await api.prepareLinkTrack(sourceUrl));
      } catch {
        preparedTrack = null;
      }
    }

    if (preparedTrack) {
      let targetIndex = state.playlist.findIndex((track) => track.id === preparedTrack.id);
      if (targetIndex < 0) {
        addTracks([preparedTrack]);
        targetIndex = state.playlist.findIndex((track) => track.id === preparedTrack.id);
      } else {
        state.playlist[targetIndex] = {
          ...state.playlist[targetIndex],
          ...preparedTrack,
        };
        renderPlaylistTabs();
        syncBuilderTracksWithLibrary();
        renderPlaylistBuilderPanel();
        renderPlaylist();
        queueStateSave();
      }

      if (targetIndex >= 0) {
        state.selectedIndex = targetIndex;
        setLinkLoadingState(true, "Starting playback...");
        applyTrack(targetIndex, true);
        return;
      }
    }

    setLinkLoadingState(true, "Trying direct stream...");

    let resolvedPayload = null;
    if (api?.resolveStreamLink) {
      try {
        resolvedPayload = await api.resolveStreamLink(sourceUrl);
      } catch {
        resolvedPayload = null;
      }
    }

    const streamUrl = normalizeAudioUrl(resolvedPayload?.streamUrl) || sourceUrl;
    const resolvedSourceUrl = normalizeAudioUrl(resolvedPayload?.sourceUrl) || sourceUrl;
    const host = typeof resolvedPayload?.host === "string" && resolvedPayload.host.trim()
      ? resolvedPayload.host.trim()
      : hostFromUrl(resolvedSourceUrl);
    const title = typeof resolvedPayload?.title === "string" && resolvedPayload.title.trim()
      ? resolvedPayload.title.trim()
      : titleFromUrl(resolvedSourceUrl);
    const platform = typeof resolvedPayload?.platform === "string" && resolvedPayload.platform.trim()
      ? resolvedPayload.platform.trim().toLowerCase()
      : "direct";
    const warning = typeof resolvedPayload?.warning === "string" ? resolvedPayload.warning.trim() : "";

    state.externalTrack = {
      url: resolvedSourceUrl,
      streamUrl,
      title,
      host,
      platform,
      warning,
      resolved: Boolean(resolvedPayload?.resolved),
    };
    state.detailsToken += 1;
    state.currentTrackDetails = {
      artist: formatPlatformLabel(platform),
      album: host,
    };

    resetCover();
    audio.src = streamUrl;
    audio.load();

    audio.play().then(() => {
      setPlayButtonState(true);
    }).catch(() => {
      setPlayButtonState(false);
      trackSubtitle.textContent = warning || "Could not play this link.";
    });

    updateNowPlayingMeta();
    renderPlaylist();
  } finally {
    setLinkLoadingState(false);
  }
}

function playCurrent() {
  if (audio.src) {
    audio.play().then(() => {
      setPlayButtonState(true);
    }).catch(() => {
      setPlayButtonState(false);
    });
    return;
  }

  if (!isValidIndex(state.currentIndex) && state.playlist.length > 0) {
    applyTrack(0, true);
    return;
  }

  if (isValidIndex(state.currentIndex)) {
    applyTrack(state.currentIndex, true);
  }
}

function pauseCurrent() {
  audio.pause();
  setPlayButtonState(false);
}

function togglePlay() {
  if (audio.paused) {
    playCurrent();
    return;
  }

  pauseCurrent();
}

function pickRandomIndex(currentIndex, length) {
  if (length <= 1) {
    return currentIndex;
  }

  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * length);
  }
  return nextIndex;
}

function playNext(autoAdvance = false) {
  if (state.playlist.length === 0) {
    return;
  }

  if (state.repeatMode === "one" && autoAdvance && !state.externalTrack) {
    audio.currentTime = 0;
    audio.play().catch(() => {
      setPlayButtonState(false);
    });
    setPlayButtonState(true);
    return;
  }

  if (state.shuffleEnabled && !state.externalTrack) {
    const randomIndex = pickRandomIndex(state.currentIndex, state.playlist.length);
    applyTrack(randomIndex, true);
    return;
  }

  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.playlist.length) {
    if (state.repeatMode === "all" && !state.externalTrack) {
      applyTrack(0, true);
      return;
    }

    pauseCurrent();
    audio.currentTime = 0;
    return;
  }

  applyTrack(nextIndex, true);
}

function playPrevious() {
  if (state.playlist.length === 0) {
    return;
  }

  if (audio.currentTime > 3 && !state.externalTrack) {
    audio.currentTime = 0;
    return;
  }

  if (state.shuffleEnabled && !state.externalTrack) {
    const randomIndex = pickRandomIndex(state.currentIndex, state.playlist.length);
    applyTrack(randomIndex, true);
    return;
  }

  const previousIndex = state.currentIndex - 1;
  if (previousIndex < 0) {
    if (state.repeatMode === "all" && !state.externalTrack) {
      applyTrack(state.playlist.length - 1, true);
      return;
    }

    applyTrack(0, true);
    return;
  }

  applyTrack(previousIndex, true);
}

function remapIndexAfterMove(index, fromIndex, toIndex) {
  if (index === fromIndex) {
    return toIndex;
  }

  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return index - 1;
  }

  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
    return index + 1;
  }

  return index;
}

function reorderPlaylist(fromIndex, toIndex) {
  if (!isValidIndex(fromIndex)) {
    return;
  }

  const boundedTarget = clampNumber(toIndex, 0, state.playlist.length - 1);
  if (!Number.isInteger(boundedTarget) || fromIndex === boundedTarget) {
    return;
  }

  const [movedTrack] = state.playlist.splice(fromIndex, 1);
  state.playlist.splice(boundedTarget, 0, movedTrack);

  state.currentIndex = remapIndexAfterMove(state.currentIndex, fromIndex, boundedTarget);
  state.selectedIndex = remapIndexAfterMove(state.selectedIndex, fromIndex, boundedTarget);

  renderPlaylist();
  queueStateSave();
}

function addTracks(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return;
  }

  const sanitized = tracks.map(sanitizeTrack).filter(Boolean);
  if (sanitized.length === 0) {
    return;
  }

  const existingIds = new Set(state.playlist.map((track) => track.id));
  const deduped = sanitized.filter((track) => !existingIds.has(track.id));

  if (deduped.length === 0) {
    return;
  }

  for (const track of deduped) {
    const coverDataUrl = normalizeCoverDataUrl(track.coverDataUrl);
    if (coverDataUrl) {
      state.trackCoverCache.set(track.id, coverDataUrl);
    }
  }

  state.playlist.push(...deduped);
  renderPlaylistTabs();
  syncBuilderTracksWithLibrary();
  renderPlaylistBuilderPanel();

  if (!isValidIndex(state.currentIndex) && !state.externalTrack) {
    applyTrack(0, false);
    return;
  }

  renderPlaylist();
  queueStateSave();
}

function resetPlaybackUi(clearExternal = true) {
  audio.src = "";
  pauseCurrent();
  seekSlider.value = "0";
  currentTimeLabel.textContent = "0:00";
  durationLabel.textContent = "0:00";
  state.currentTrackDetails = null;
  if (clearExternal) {
    state.externalTrack = null;
  }
  resetCover();
}

function removeTrackAtIndex(index, persistState = true) {
  if (!isValidIndex(index)) {
    return false;
  }

  const removedIndex = index;
  const removedTrack = state.playlist[removedIndex];
  state.playlist.splice(removedIndex, 1);
  if (state.selectedIndex === removedIndex) {
    state.selectedIndex = -1;
  } else if (removedIndex < state.selectedIndex) {
    state.selectedIndex -= 1;
  }
  if (!trackExistsInAnyPlaylist(removedTrack.id)) {
    state.likedTrackIds.delete(removedTrack.id);
  }

  renderPlaylistTabs();
  syncBuilderTracksWithLibrary();
  renderPlaylistBuilderPanel();

  if (state.playlist.length === 0) {
    state.deleteMode = false;
    state.currentIndex = -1;
    if (!state.externalTrack) {
      resetPlaybackUi(true);
    }
    updateNowPlayingMeta();
    renderPlaylist();
    if (persistState) {
      queueStateSave();
    }
    return true;
  }

  if (removedIndex < state.currentIndex) {
    state.currentIndex -= 1;
  } else if (removedIndex === state.currentIndex && !state.externalTrack) {
    const fallbackIndex = Math.min(removedIndex, state.playlist.length - 1);
    applyTrack(fallbackIndex, false, persistState);
    return true;
  }

  renderPlaylist();
  if (persistState) {
    queueStateSave();
  }
  return true;
}

function removeSelectedTrack() {
  if (!isValidIndex(state.selectedIndex)) {
    return;
  }

  removeTrackAtIndex(state.selectedIndex, true);
}

function clearPlaylist() {
  const externalActive = Boolean(state.externalTrack);
  const activePlaylist = syncActivePlaylistReference();

  activePlaylist.tracks.length = 0;
  state.playlist = activePlaylist.tracks;
  state.currentIndex = -1;
  state.selectedIndex = -1;
  state.deleteMode = false;
  cleanFavoriteIds();
  state.searchQuery = "";
  state.filterMode = "all";
  searchInput.value = "";
  clearDragIndicators();

  if (!externalActive) {
    resetPlaybackUi(true);
  }

  updateNowPlayingMeta();
  renderPlaylistTabs();
  syncBuilderTracksWithLibrary();
  renderPlaylistBuilderPanel();
  renderPlaylist();
  queueStateSave();
}

async function addFilesFromDialog() {
  if (!api?.pickFiles) {
    return;
  }

  const tracks = await api.pickFiles();
  addTracks(tracks);
}

async function addFolderFromDialog() {
  if (!api?.pickFolder) {
    return;
  }

  const tracks = await api.pickFolder();
  addTracks(tracks);
}

async function restorePersistedState() {
  if (!api?.loadState) {
    return;
  }

  let savedState = null;
  try {
    savedState = await api.loadState();
  } catch {
    savedState = null;
  }

  if (!savedState || typeof savedState !== "object") {
    return;
  }

  const restored = normalizeRestoredPlaylists(savedState);
  state.playlists = restored.playlists;
  state.activePlaylistId = restored.activePlaylistId;
  syncActivePlaylistReference();
  const restoredSettings = savedState.settings && typeof savedState.settings === "object" ? savedState.settings : {};
  state.settings.autoPlayOnStartup = Boolean(restoredSettings.autoPlayOnStartup);
  state.settings.themeAccent = normalizeThemeAccent(restoredSettings.themeAccent, DEFAULT_THEME_ACCENT);
  state.settings.outputDeviceId = typeof restoredSettings.outputDeviceId === "string"
    ? restoredSettings.outputDeviceId
    : "";
  applyThemeAccent(state.settings.themeAccent, false);
  state.trackCoverCache.clear();
  for (const playlist of state.playlists) {
    for (const track of playlist.tracks) {
      const coverDataUrl = normalizeCoverDataUrl(track.coverDataUrl);
      if (coverDataUrl) {
        state.trackCoverCache.set(track.id, coverDataUrl);
      }
    }
  }
  state.repeatMode = REPEAT_MODES.includes(savedState.repeatMode) ? savedState.repeatMode : "off";
  state.shuffleEnabled = Boolean(savedState.shuffleEnabled);
  state.filterMode = FILTER_MODES.includes(savedState.filterMode) ? savedState.filterMode : "all";

  const restoredLikedTrackIds = Array.isArray(savedState.likedTrackIds)
    ? savedState.likedTrackIds.filter((id) => typeof id === "string" && id.trim())
    : [];
  state.likedTrackIds = new Set(restoredLikedTrackIds);
  cleanFavoriteIds();

  const savedSearchQuery = typeof savedState.searchQuery === "string" ? savedState.searchQuery : "";
  state.searchQuery = savedSearchQuery;
  searchInput.value = savedSearchQuery;

  const savedVolume = clampNumber(Number(savedState.volume), 0, 1);
  const startingVolume = Number.isFinite(savedVolume) ? savedVolume : DEFAULT_VOLUME;
  setVolume(startingVolume, false);
  await applyOutputDevice(state.settings.outputDeviceId, false);

  renderPlaylistTabs();
  renderAppSettingsPanel();

  if (state.playlist.length === 0) {
    state.currentIndex = -1;
    state.selectedIndex = -1;
    updateModeButtons();
    applyCover(getActivePlaylistCoverDataUrl());
    updateNowPlayingMeta();
    renderPlaylist();
    return;
  }

  const candidateCurrentIndex = Number.isInteger(savedState.currentIndex) ? savedState.currentIndex : -1;
  const candidateSelectedIndex = Number.isInteger(savedState.selectedIndex) ? savedState.selectedIndex : -1;
  state.currentIndex = candidateCurrentIndex >= 0
    ? clampNumber(candidateCurrentIndex, 0, state.playlist.length - 1)
    : -1;
  state.selectedIndex = candidateSelectedIndex >= 0
    ? clampNumber(candidateSelectedIndex, 0, state.playlist.length - 1)
    : -1;

  updateModeButtons();

  if (isValidIndex(state.currentIndex)) {
    const shouldAutoPlay = Boolean(state.settings.autoPlayOnStartup);
    applyTrack(state.currentIndex, shouldAutoPlay, false);
    return;
  }

  resetPlaybackUi(true);
  applyCover(getActivePlaylistCoverDataUrl());
  updateNowPlayingMeta();
  renderPlaylist();
}

addFilesButton.addEventListener("click", () => {
  addFilesFromDialog();
});

addFolderButton.addEventListener("click", () => {
  addFolderFromDialog();
});

playLinkButton.addEventListener("click", () => {
  playFromLink();
});

songLinkInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    playFromLink();
  }
});

playButton.addEventListener("click", togglePlay);
prevButton.addEventListener("click", playPrevious);
nextButton.addEventListener("click", () => playNext(false));

shuffleButton.addEventListener("click", () => {
  state.shuffleEnabled = !state.shuffleEnabled;
  updateModeButtons();
  queueStateSave();
});

repeatButton.addEventListener("click", () => {
  const modeIndex = REPEAT_MODES.indexOf(state.repeatMode);
  const nextIndex = (modeIndex + 1) % REPEAT_MODES.length;
  state.repeatMode = REPEAT_MODES[nextIndex];

  updateModeButtons();
  queueStateSave();
});

likeCurrentButton.addEventListener("click", () => {
  if (!isValidIndex(state.currentIndex) || state.externalTrack) {
    return;
  }

  toggleTrackLikeByIndex(state.currentIndex);
});

favoritesFilterButton.addEventListener("click", () => {
  state.filterMode = state.filterMode === "all" ? "favorites" : "all";
  renderPlaylist();
  queueStateSave();
});

searchInput.addEventListener("input", () => {
  state.searchQuery = searchInput.value || "";
  renderPlaylist();
  queueStateSave();
});

removeButton.addEventListener("click", () => {
  if (state.playlist.length === 0) {
    return;
  }

  state.deleteMode = !state.deleteMode;
  renderPlaylist();
});
clearButton.addEventListener("click", clearPlaylist);

playlistTabs.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("button[data-delete-playlist-id]");
  if (deleteButton) {
    const playlistId = deleteButton.dataset.deletePlaylistId;
    if (typeof playlistId === "string" && playlistId) {
      deletePlaylistById(playlistId, true);
    }
    return;
  }

  const menuToggleButton = event.target.closest("button[data-menu-playlist-id]");
  if (menuToggleButton) {
    const playlistId = menuToggleButton.dataset.menuPlaylistId;
    if (typeof playlistId === "string" && playlistId) {
      state.playlistTabMenuOpenId = state.playlistTabMenuOpenId === playlistId ? "" : playlistId;
      syncPlaylistTabMenuUi();
    }
    return;
  }

  const tabButton = event.target.closest(".playlist-tab");
  if (!tabButton) {
    return;
  }

  const playlistId = tabButton.dataset.playlistId;
  if (typeof playlistId !== "string" || !playlistId) {
    return;
  }

  state.playlistTabMenuOpenId = "";
  activatePlaylist(playlistId, true);
});

window.addEventListener("pointerdown", (event) => {
  if (!state.playlistTabMenuOpenId) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("#playlist-tabs")) {
    return;
  }

  closePlaylistTabMenu();
});

openPlaylistBuilderButton.addEventListener("click", () => {
  if (state.playlistBuilder.open) {
    closePlaylistBuilderPanel();
    return;
  }

  openPlaylistBuilderPanel();
});

openSettingsButton?.addEventListener("click", () => {
  if (state.settingsOpen) {
    closeAppSettingsPanel();
    return;
  }

  openAppSettingsPanel();
});

closeSettingsButton?.addEventListener("click", () => {
  closeAppSettingsPanel();
});

appSettingsBackdrop?.addEventListener("click", () => {
  closeAppSettingsPanel();
});

settingsAutoplayToggle?.addEventListener("change", () => {
  state.settings.autoPlayOnStartup = Boolean(settingsAutoplayToggle.checked);
  queueStateSave();
  renderAppSettingsPanel();
});

settingsStartupToggle?.addEventListener("change", async () => {
  if (!api?.setStartupLaunch || !state.settings.launchOnStartupSupported) {
    renderAppSettingsPanel();
    return;
  }

  const requested = Boolean(settingsStartupToggle.checked);
  settingsStartupToggle.disabled = true;
  try {
    const updated = await api.setStartupLaunch(requested);
    state.settings.launchOnStartupSupported = Boolean(updated?.supported);
    state.settings.launchOnStartup = Boolean(updated?.enabled);
  } catch {
    // Keep prior values.
  }
  renderAppSettingsPanel();
});

settingsThemeColorInput?.addEventListener("input", () => {
  applyThemeAccent(settingsThemeColorInput.value, true);
  renderAppSettingsPanel();
});

settingsThemeColorText?.addEventListener("change", () => {
  const normalized = normalizeThemeAccent(settingsThemeColorText.value, state.settings.themeAccent);
  applyThemeAccent(normalized, true);
  renderAppSettingsPanel();
});

settingsThemeColorText?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const normalized = normalizeThemeAccent(settingsThemeColorText.value, state.settings.themeAccent);
    applyThemeAccent(normalized, true);
    renderAppSettingsPanel();
  }
});

settingsThemeResetButton?.addEventListener("click", () => {
  applyThemeAccent(DEFAULT_THEME_ACCENT, true);
  renderAppSettingsPanel();
});

settingsOutputDeviceSelect?.addEventListener("change", async () => {
  await applyOutputDevice(settingsOutputDeviceSelect.value || "", true);
});

settingsRefreshDevicesButton?.addEventListener("click", () => {
  refreshOutputDevices();
});

deletePlaylistButton?.addEventListener("click", () => {
  deleteActivePlaylist();
});

setPlaylistCoverButton?.addEventListener("click", () => {
  setActivePlaylistCoverFromSystem();
});

clearPlaylistCoverButton?.addEventListener("click", () => {
  clearActivePlaylistCover();
});

builderCancelButton.addEventListener("click", () => {
  closePlaylistBuilderPanel();
});

builderNewPlaylistButton?.addEventListener("click", () => {
  startBuilderNewPlaylist();
});

playlistBuilderBackdrop?.addEventListener("click", () => {
  closePlaylistBuilderPanel();
});

builderUseMainListButton.addEventListener("click", () => {
  useMainListForBuilder();
});

builderAddSystemButton.addEventListener("click", () => {
  addBuilderSongsFromSystem();
});

builderSetCoverButton.addEventListener("click", () => {
  setBuilderCoverFromSystem();
});

builderClearCoverButton.addEventListener("click", () => {
  clearBuilderCover();
});

builderCreateButton.addEventListener("click", () => {
  createPlaylistFromBuilder();
});

builderPlaylistList?.addEventListener("click", (event) => {
  const settingsButton = event.target.closest("button[data-settings-playlist-id]");
  if (settingsButton) {
    const settingsPlaylistId = settingsButton.dataset.settingsPlaylistId;
    if (typeof settingsPlaylistId === "string" && settingsPlaylistId) {
      openBuilderPlaylistSettings(settingsPlaylistId, true);
    }
    return;
  }

  const mainButton = event.target.closest("button[data-playlist-id]");
  if (!mainButton) {
    return;
  }

  const playlistId = mainButton.dataset.playlistId;
  if (typeof playlistId !== "string" || !playlistId) {
    return;
  }

  openBuilderPlaylistSettings(playlistId, false);
});

builderPlaylistNameInput.addEventListener("input", () => {
  state.playlistBuilder.name = builderPlaylistNameInput.value || "";
  refreshBuilderCoverPreview();
});

builderPlaylistNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createPlaylistFromBuilder();
  }
});

builderSongSearchInput.addEventListener("input", () => {
  state.playlistBuilder.searchQuery = builderSongSearchInput.value || "";
  renderPlaylistBuilderSongList();
});

builderSettingsNameInput?.addEventListener("input", () => {
  state.playlistBuilder.settingsName = builderSettingsNameInput.value || "";
});

builderSettingsNameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveBuilderPlaylistSettings();
  }
});

builderSettingsOpenButton?.addEventListener("click", () => {
  openBuilderSettingsPlaylist();
});

builderSettingsSetCoverButton?.addEventListener("click", () => {
  setBuilderSettingsPlaylistCoverFromSystem();
});

builderSettingsClearCoverButton?.addEventListener("click", () => {
  clearBuilderSettingsPlaylistCover();
});

builderSettingsSaveButton?.addEventListener("click", () => {
  saveBuilderPlaylistSettings();
});

builderSettingsDeleteButton?.addEventListener("click", () => {
  deleteBuilderSettingsPlaylist();
});

builderSongList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[type='checkbox'][data-track-id]");
  if (!checkbox) {
    return;
  }

  const trackId = checkbox.dataset.trackId;
  if (typeof trackId !== "string" || !trackId) {
    return;
  }

  if (checkbox.checked) {
    state.playlistBuilder.selectedTrackIds.add(trackId);
  } else {
    state.playlistBuilder.selectedTrackIds.delete(trackId);
  }

  if (builderCreateButton) {
    builderCreateButton.disabled = state.playlistBuilder.selectedTrackIds.size === 0;
  }
});

playlistElement.addEventListener("click", (event) => {
  const likeButton = event.target.closest(".song-like-btn");
  if (likeButton) {
    const likeIndex = Number(likeButton.dataset.index);
    if (!Number.isNaN(likeIndex)) {
      toggleTrackLikeByIndex(likeIndex);
    }
    return;
  }

  const deleteTrackButton = event.target.closest(".song-delete-btn");
  if (deleteTrackButton) {
    const deleteIndex = Number(deleteTrackButton.dataset.index);
    if (!Number.isNaN(deleteIndex)) {
      removeTrackAtIndex(deleteIndex, true);
    }
    return;
  }

  if (event.target.closest(".song-drag-handle")) {
    return;
  }

  const target = event.target.closest(".song-item");
  if (!target) {
    return;
  }

  const clickedIndex = Number(target.dataset.index);
  if (Number.isNaN(clickedIndex)) {
    return;
  }

  state.selectedIndex = clickedIndex;
  if (clickedIndex === state.currentIndex && !state.externalTrack) {
    audio.play().catch(() => {
      setPlayButtonState(false);
    });
    renderPlaylist();
    queueStateSave();
    return;
  }

  applyTrack(clickedIndex, true);
});

playlistElement.addEventListener("dragstart", (event) => {
  const handle = event.target.closest(".song-drag-handle");
  if (!handle) {
    return;
  }

  const draggedIndex = Number(handle.dataset.index);
  if (Number.isNaN(draggedIndex)) {
    return;
  }

  const target = handle.closest(".song-item");
  if (!target) {
    return;
  }

  state.dragSourceIndex = draggedIndex;
  target.classList.add("dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(draggedIndex));
  }
});

playlistElement.addEventListener("dragover", (event) => {
  const target = event.target.closest(".song-item");
  if (!target) {
    return;
  }

  const targetIndex = Number(target.dataset.index);
  if (Number.isNaN(targetIndex) || targetIndex === state.dragSourceIndex) {
    return;
  }

  event.preventDefault();
  clearDragIndicators();

  const rect = target.getBoundingClientRect();
  const dropAfter = event.clientY > rect.top + rect.height / 2;
  target.classList.add(dropAfter ? "drag-over-after" : "drag-over-before");

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
});

playlistElement.addEventListener("drop", (event) => {
  const target = event.target.closest(".song-item");
  if (!target) {
    return;
  }

  event.preventDefault();

  let fromIndex = state.dragSourceIndex;
  if (!isValidIndex(fromIndex) && event.dataTransfer) {
    fromIndex = Number(event.dataTransfer.getData("text/plain"));
  }

  const targetIndex = Number(target.dataset.index);
  if (!isValidIndex(fromIndex) || Number.isNaN(targetIndex) || fromIndex === targetIndex) {
    clearDragIndicators();
    state.dragSourceIndex = -1;
    return;
  }

  const rect = target.getBoundingClientRect();
  const dropAfter = event.clientY > rect.top + rect.height / 2;

  let destination = dropAfter ? targetIndex + 1 : targetIndex;
  if (fromIndex < destination) {
    destination -= 1;
  }

  reorderPlaylist(fromIndex, destination);
  clearDragIndicators();
  state.dragSourceIndex = -1;
});

playlistElement.addEventListener("dragend", () => {
  clearDragIndicators();
  state.dragSourceIndex = -1;
});

volumeSlider.addEventListener("input", () => {
  setVolume(Number(volumeSlider.value), true);
});

volumeButton.addEventListener("click", () => {
  toggleMute();
});

seekSlider.addEventListener("input", () => {
  state.seeking = true;
  currentTimeLabel.textContent = formatTime(Number(seekSlider.value));
});

seekSlider.addEventListener("change", () => {
  const requestedTime = Number(seekSlider.value);
  if (Number.isFinite(requestedTime)) {
    audio.currentTime = requestedTime;
  }
  state.seeking = false;
});

audio.addEventListener("loadedmetadata", () => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  seekSlider.max = String(Math.floor(duration));
  seekSlider.value = "0";
  durationLabel.textContent = formatTime(duration);
  currentTimeLabel.textContent = "0:00";
});

audio.addEventListener("timeupdate", () => {
  if (!state.seeking) {
    seekSlider.value = String(Math.floor(audio.currentTime));
    currentTimeLabel.textContent = formatTime(audio.currentTime);
  }
});

audio.addEventListener("play", () => {
  setPlayButtonState(true);
});

audio.addEventListener("pause", () => {
  setPlayButtonState(false);
});

audio.addEventListener("ended", () => {
  if (state.externalTrack) {
    pauseCurrent();
    audio.currentTime = 0;
    return;
  }

  playNext(true);
});

audio.addEventListener("error", () => {
  if (state.externalTrack) {
    trackSubtitle.textContent = "Could not play this link.";
    return;
  }

  const currentTrack = state.playlist[state.currentIndex];
  if (isLinkTrack(currentTrack)) {
    trackSubtitle.textContent = "Could not play cached link audio.";
    return;
  }

  trackSubtitle.textContent = "Could not play this file.";
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && state.settingsOpen) {
    event.preventDefault();
    closeAppSettingsPanel();
    return;
  }

  if (event.code === "Escape" && state.playlistBuilder.open) {
    event.preventDefault();
    closePlaylistBuilderPanel();
    return;
  }

  if (event.code === "Escape" && state.playlistTabMenuOpenId) {
    event.preventDefault();
    closePlaylistTabMenu();
    return;
  }

  const targetTag = event.target.tagName;
  const isTypingField = targetTag === "INPUT" || targetTag === "TEXTAREA";
  if (isTypingField) {
    return;
  }

  if (state.playlistBuilder.open || state.settingsOpen) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
    return;
  }

  if (event.code === "ArrowRight") {
    playNext(false);
    return;
  }

  if (event.code === "ArrowLeft") {
    playPrevious();
    return;
  }

  if (event.code === "Delete") {
    removeSelectedTrack();
    return;
  }

  if (event.code === "KeyF") {
    toggleTrackLikeByIndex(state.currentIndex);
    return;
  }

  if (event.code === "KeyM") {
    toggleMute();
    return;
  }
});

window.addEventListener("beforeunload", () => {
  flushStateSave();
});

async function initializePlayer() {
  setPlayButtonState(false);
  applyThemeAccent(state.settings.themeAccent, false);
  setVolume(DEFAULT_VOLUME, false);
  applyCover(getActivePlaylistCoverDataUrl());
  updateNowPlayingMeta();
  updateModeButtons();
  renderPlaylistTabs();
  renderPlaylistBuilderPanel();
  renderAppSettingsPanel();
  renderPlaylist();
  await restorePersistedState();
  await refreshStartupLaunchSetting();
  await refreshOutputDevices();

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshOutputDevices();
    });
  }
}

initializePlayer();
