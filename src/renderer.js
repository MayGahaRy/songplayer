
const DEFAULT_VOLUME = 0.85;
const REPEAT_MODES = ["off", "all", "one"];
const FILTER_MODES = ["all", "favorites"];
const EMPTY_PLAYLIST_MESSAGE = "No songs yet. Click \"Add Songs\" or import an entire folder.";
const EMPTY_FILTER_MESSAGE = "No songs match the current search or favorite filter.";

const state = {
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
};

const audio = document.getElementById("audio-player");
const addFilesButton = document.getElementById("add-files-btn");
const addFolderButton = document.getElementById("add-folder-btn");
const playLinkButton = document.getElementById("play-link-btn");
const songLinkInput = document.getElementById("song-link-input");
const playButton = document.getElementById("play-btn");
const prevButton = document.getElementById("prev-btn");
const nextButton = document.getElementById("next-btn");
const shuffleButton = document.getElementById("shuffle-btn");
const repeatButton = document.getElementById("repeat-btn");
const likeCurrentButton = document.getElementById("like-current-btn");
const moveUpButton = document.getElementById("move-up-btn");
const moveDownButton = document.getElementById("move-down-btn");
const removeButton = document.getElementById("remove-btn");
const clearButton = document.getElementById("clear-btn");
const favoritesFilterButton = document.getElementById("favorites-filter-btn");
const searchInput = document.getElementById("search-input");
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

  const title = typeof track.title === "string" && track.title.trim() ? track.title.trim() : titleFromPath(track.path);

  return {
    id: typeof track.id === "string" && track.id ? track.id : track.path,
    path: track.path,
    title,
    fileUrl: track.fileUrl,
  };
}

function isTrackLiked(trackId) {
  return typeof trackId === "string" && state.likedTrackIds.has(trackId);
}

function cleanFavoriteIds() {
  const playlistIds = new Set(state.playlist.map((track) => track.id));
  for (const likedId of state.likedTrackIds) {
    if (!playlistIds.has(likedId)) {
      state.likedTrackIds.delete(likedId);
    }
  }
}

function serializeState() {
  cleanFavoriteIds();
  return {
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    selectedIndex: state.selectedIndex,
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    volume: clampNumber(Number(volumeSlider.value), 0, 1),
    likedTrackIds: [...state.likedTrackIds],
    filterMode: state.filterMode,
    searchQuery: state.searchQuery,
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
  coverWrap.classList.remove("has-cover");
  coverImage.removeAttribute("src");
  coverGlow.style.backgroundImage = "";
}

function applyCover(coverDataUrl) {
  const isValidCover = typeof coverDataUrl === "string" && coverDataUrl.startsWith("data:image/");

  if (!isValidCover) {
    resetCover();
    return;
  }

  coverImage.src = coverDataUrl;
  coverWrap.classList.add("has-cover");
  coverGlow.style.backgroundImage = `url("${coverDataUrl}")`;
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
    trackSubtitle.textContent = `Direct Link - ${state.externalTrack.host}`;
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
  trackPath.textContent = currentTrack.path;

  if (!state.currentTrackDetails) {
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

  playButton.disabled = !hasSource;
  prevButton.disabled = !hasTracks;
  nextButton.disabled = !hasTracks;
  shuffleButton.disabled = !hasTracks;
  repeatButton.disabled = !hasTracks;
  removeButton.disabled = !isValidIndex(state.selectedIndex);
  moveUpButton.disabled = !isValidIndex(state.selectedIndex) || state.selectedIndex <= 0;
  moveDownButton.disabled = !isValidIndex(state.selectedIndex) || state.selectedIndex >= state.playlist.length - 1;
  clearButton.disabled = !hasTracks;
  searchInput.disabled = !hasTracks;
  favoritesFilterButton.disabled = !hasTracks;
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
      const haystack = `${track.title} ${track.path}`.toLowerCase();
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

  const visibleIndexes = getVisibleTrackIndexes();

  for (const index of visibleIndexes) {
    const track = state.playlist[index];
    const item = document.createElement("li");
    item.className = "song-item";
    item.dataset.index = String(index);
    item.draggable = true;

    const topRow = document.createElement("div");
    topRow.className = "song-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "song-title-wrap";

    const dragIcon = createIconSvg("icon-drag", "song-drag");

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = track.title;

    titleWrap.append(dragIcon, title);

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

    const filePath = document.createElement("div");
    filePath.className = "song-path";
    filePath.textContent = track.path;

    topRow.append(titleWrap, likeButton);
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
    resetCover();
    updateNowPlayingMeta();
    return;
  }

  if (!api?.getTrackDetails) {
    state.currentTrackDetails = { artist: "Unknown artist", album: "" };
    resetCover();
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
    resetCover();
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

  applyCover(details.coverDataUrl || null);
  updateNowPlayingMeta();
}

function applyTrack(index, shouldPlay = false, persistState = true) {
  if (!isValidIndex(index)) {
    return;
  }

  state.externalTrack = null;
  state.currentIndex = index;
  state.currentTrackDetails = null;
  resetCover();

  const track = state.playlist[index];
  audio.src = track.fileUrl;
  audio.load();

  if (shouldPlay) {
    audio.play().catch(() => {
      setPlayButtonState(false);
    });
  }

  setPlayButtonState(shouldPlay);
  updateNowPlayingMeta();
  renderPlaylist();
  hydrateCurrentTrackDetails(index);

  if (persistState) {
    queueStateSave();
  }
}

function playFromLink() {
  const normalizedUrl = normalizeAudioUrl(songLinkInput.value);
  if (!normalizedUrl) {
    trackSubtitle.textContent = "Enter a valid http(s) audio link.";
    return;
  }

  let hostname = "link";
  try {
    hostname = new URL(normalizedUrl).hostname || "link";
  } catch {
    // Ignore hostname parse failure.
  }

  state.externalTrack = {
    url: normalizedUrl,
    title: titleFromUrl(normalizedUrl),
    host: hostname,
  };
  state.detailsToken += 1;
  state.currentTrackDetails = {
    artist: "Direct Link",
    album: hostname,
  };

  resetCover();
  audio.src = normalizedUrl;
  audio.load();

  audio.play().then(() => {
    setPlayButtonState(true);
  }).catch(() => {
    setPlayButtonState(false);
    trackSubtitle.textContent = "Could not play this link.";
  });

  updateNowPlayingMeta();
  renderPlaylist();
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

function moveSelectedBy(offset) {
  if (!isValidIndex(state.selectedIndex)) {
    return;
  }

  const targetIndex = state.selectedIndex + offset;
  if (!isValidIndex(targetIndex)) {
    return;
  }

  reorderPlaylist(state.selectedIndex, targetIndex);
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

  state.playlist.push(...deduped);

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

function removeSelectedTrack() {
  if (!isValidIndex(state.selectedIndex)) {
    return;
  }

  const removedIndex = state.selectedIndex;
  const removedTrack = state.playlist[removedIndex];
  state.playlist.splice(removedIndex, 1);
  state.selectedIndex = -1;
  state.likedTrackIds.delete(removedTrack.id);

  if (state.playlist.length === 0) {
    state.currentIndex = -1;
    if (!state.externalTrack) {
      resetPlaybackUi(true);
    }
    updateNowPlayingMeta();
    renderPlaylist();
    queueStateSave();
    return;
  }

  if (removedIndex < state.currentIndex) {
    state.currentIndex -= 1;
  } else if (removedIndex === state.currentIndex && !state.externalTrack) {
    const fallbackIndex = Math.min(removedIndex, state.playlist.length - 1);
    applyTrack(fallbackIndex, false);
    return;
  }

  renderPlaylist();
  queueStateSave();
}

function clearPlaylist() {
  const externalActive = Boolean(state.externalTrack);

  state.playlist = [];
  state.currentIndex = -1;
  state.selectedIndex = -1;
  state.likedTrackIds.clear();
  state.searchQuery = "";
  state.filterMode = "all";
  searchInput.value = "";
  clearDragIndicators();

  if (!externalActive) {
    resetPlaybackUi(true);
  }

  updateNowPlayingMeta();
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

  const restoredPlaylist = Array.isArray(savedState.playlist)
    ? savedState.playlist.map(sanitizeTrack).filter(Boolean)
    : [];

  state.playlist = restoredPlaylist;
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

  if (state.playlist.length === 0) {
    state.currentIndex = -1;
    state.selectedIndex = -1;
    updateModeButtons();
    updateNowPlayingMeta();
    renderPlaylist();
    return;
  }

  const candidateCurrentIndex = Number.isInteger(savedState.currentIndex) ? savedState.currentIndex : 0;
  const candidateSelectedIndex = Number.isInteger(savedState.selectedIndex) ? savedState.selectedIndex : -1;
  state.currentIndex = clampNumber(candidateCurrentIndex, 0, state.playlist.length - 1);
  state.selectedIndex = candidateSelectedIndex >= 0
    ? clampNumber(candidateSelectedIndex, 0, state.playlist.length - 1)
    : -1;

  updateModeButtons();
  applyTrack(state.currentIndex, false, false);
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

moveUpButton.addEventListener("click", () => {
  moveSelectedBy(-1);
});

moveDownButton.addEventListener("click", () => {
  moveSelectedBy(1);
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

removeButton.addEventListener("click", removeSelectedTrack);
clearButton.addEventListener("click", clearPlaylist);

playlistElement.addEventListener("click", (event) => {
  const likeButton = event.target.closest(".song-like-btn");
  if (likeButton) {
    const likeIndex = Number(likeButton.dataset.index);
    if (!Number.isNaN(likeIndex)) {
      toggleTrackLikeByIndex(likeIndex);
    }
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
  renderPlaylist();
  queueStateSave();
});

playlistElement.addEventListener("dblclick", (event) => {
  if (event.target.closest(".song-like-btn")) {
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
  applyTrack(clickedIndex, true);
});

playlistElement.addEventListener("dragstart", (event) => {
  const target = event.target.closest(".song-item");
  if (!target) {
    return;
  }

  const draggedIndex = Number(target.dataset.index);
  if (Number.isNaN(draggedIndex)) {
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

  trackSubtitle.textContent = "Could not play this file.";
});

window.addEventListener("keydown", (event) => {
  const targetTag = event.target.tagName;
  const isTypingField = targetTag === "INPUT" || targetTag === "TEXTAREA";
  if (isTypingField) {
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

  if (event.code === "ArrowUp" && event.altKey) {
    event.preventDefault();
    moveSelectedBy(-1);
    return;
  }

  if (event.code === "ArrowDown" && event.altKey) {
    event.preventDefault();
    moveSelectedBy(1);
  }
});

window.addEventListener("beforeunload", () => {
  flushStateSave();
});

async function initializePlayer() {
  setPlayButtonState(false);
  setVolume(DEFAULT_VOLUME, false);
  updateNowPlayingMeta();
  updateModeButtons();
  renderPlaylist();
  await restorePersistedState();
}

initializePlayer();
