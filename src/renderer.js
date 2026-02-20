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
};

const audio = document.getElementById("audio-player");
const addFilesButton = document.getElementById("add-files-btn");
const addFolderButton = document.getElementById("add-folder-btn");
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
const favoritesSummary = document.getElementById("favorites-summary");
const seekSlider = document.getElementById("seek-slider");
const volumeSlider = document.getElementById("volume-slider");
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

const api = window.songPlayerAPI;

function titleFromPath(filePath) {
  const chunks = String(filePath).split(/[\\/]/);
  const filename = chunks[chunks.length - 1] || "Unknown Song";
  const withoutExt = filename.replace(/\.[^/.]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").trim() || filename;
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
    // Ignore persistence failures and keep playback functional.
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

function updateNowPlayingMeta() {
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
  if (!isValidIndex(state.currentIndex)) {
    likeCurrentButton.disabled = true;
    likeCurrentButton.textContent = "Like";
    likeCurrentButton.classList.remove("active");
    return;
  }

  const currentTrack = state.playlist[state.currentIndex];
  const liked = isTrackLiked(currentTrack.id);

  likeCurrentButton.disabled = false;
  likeCurrentButton.textContent = liked ? "Liked" : "Like";
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
  favoritesFilterButton.textContent = favoritesOnly ? "Favorites Only" : "All Songs";
}

function updateControlState() {
  const hasTracks = state.playlist.length > 0;
  playButton.disabled = !hasTracks;
  prevButton.disabled = !hasTracks;
  nextButton.disabled = !hasTracks;
  shuffleButton.disabled = !hasTracks;
  repeatButton.disabled = !hasTracks;
  removeButton.disabled = !isValidIndex(state.selectedIndex);
  clearButton.disabled = !hasTracks;
  searchInput.disabled = !hasTracks;
  favoritesFilterButton.disabled = !hasTracks;
}

function updateModeButtons() {
  shuffleButton.classList.toggle("active", state.shuffleEnabled);
  shuffleButton.textContent = state.shuffleEnabled ? "Shuffle On" : "Shuffle Off";

  if (state.repeatMode === "off") {
    repeatButton.textContent = "Repeat Off";
  }
  if (state.repeatMode === "all") {
    repeatButton.textContent = "Repeat All";
  }
  if (state.repeatMode === "one") {
    repeatButton.textContent = "Repeat One";
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

    const topRow = document.createElement("div");
    topRow.className = "song-head";

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = track.title;

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "song-like-btn";
    likeButton.dataset.index = String(index);

    const liked = isTrackLiked(track.id);
    likeButton.textContent = liked ? "Liked" : "Like";
    likeButton.classList.toggle("active", liked);

    const filePath = document.createElement("div");
    filePath.className = "song-path";
    filePath.textContent = track.path;

    topRow.append(title, likeButton);
    item.append(topRow, filePath);

    if (index === state.currentIndex) {
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

  if (requestToken !== state.detailsToken || expectedIndex !== state.currentIndex) {
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

  state.currentIndex = index;
  state.currentTrackDetails = null;
  resetCover();

  const track = state.playlist[index];
  audio.src = track.fileUrl;
  audio.load();

  if (shouldPlay) {
    audio.play().catch(() => {
      playButton.textContent = "Play";
    });
  }

  playButton.textContent = shouldPlay ? "Pause" : "Play";
  updateNowPlayingMeta();
  renderPlaylist();
  hydrateCurrentTrackDetails(index);

  if (persistState) {
    queueStateSave();
  }
}

function playCurrent() {
  if (state.playlist.length === 0) {
    return;
  }

  if (!isValidIndex(state.currentIndex)) {
    applyTrack(0, true);
    return;
  }

  if (!audio.src) {
    applyTrack(state.currentIndex, true);
    return;
  }

  audio.play().then(() => {
    playButton.textContent = "Pause";
  }).catch(() => {
    playButton.textContent = "Play";
  });
}

function pauseCurrent() {
  audio.pause();
  playButton.textContent = "Play";
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

  if (state.repeatMode === "one" && autoAdvance) {
    audio.currentTime = 0;
    audio.play().catch(() => {
      playButton.textContent = "Play";
    });
    playButton.textContent = "Pause";
    return;
  }

  if (state.shuffleEnabled) {
    const randomIndex = pickRandomIndex(state.currentIndex, state.playlist.length);
    applyTrack(randomIndex, true);
    return;
  }

  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.playlist.length) {
    if (state.repeatMode === "all") {
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

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (state.shuffleEnabled) {
    const randomIndex = pickRandomIndex(state.currentIndex, state.playlist.length);
    applyTrack(randomIndex, true);
    return;
  }

  const previousIndex = state.currentIndex - 1;
  if (previousIndex < 0) {
    if (state.repeatMode === "all") {
      applyTrack(state.playlist.length - 1, true);
      return;
    }

    applyTrack(0, true);
    return;
  }

  applyTrack(previousIndex, true);
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

  if (!isValidIndex(state.currentIndex)) {
    applyTrack(0, false);
    return;
  }

  renderPlaylist();
  queueStateSave();
}

function resetPlaybackUi() {
  audio.src = "";
  pauseCurrent();
  seekSlider.value = "0";
  currentTimeLabel.textContent = "0:00";
  durationLabel.textContent = "0:00";
  state.currentTrackDetails = null;
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
    resetPlaybackUi();
    updateNowPlayingMeta();
    renderPlaylist();
    queueStateSave();
    return;
  }

  if (removedIndex < state.currentIndex) {
    state.currentIndex -= 1;
  } else if (removedIndex === state.currentIndex) {
    const fallbackIndex = Math.min(removedIndex, state.playlist.length - 1);
    applyTrack(fallbackIndex, false);
    return;
  }

  renderPlaylist();
  queueStateSave();
}

function clearPlaylist() {
  state.playlist = [];
  state.currentIndex = -1;
  state.selectedIndex = -1;
  state.likedTrackIds.clear();
  state.searchQuery = "";
  state.filterMode = "all";
  searchInput.value = "";

  resetPlaybackUi();
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

  const restoredFilterMode = FILTER_MODES.includes(savedState.filterMode) ? savedState.filterMode : "all";
  state.filterMode = restoredFilterMode;

  const restoredLikedTrackIds = Array.isArray(savedState.likedTrackIds)
    ? savedState.likedTrackIds.filter((id) => typeof id === "string" && id.trim())
    : [];
  state.likedTrackIds = new Set(restoredLikedTrackIds);
  cleanFavoriteIds();

  const savedVolume = clampNumber(Number(savedState.volume), 0, 1);
  const startingVolume = Number.isFinite(savedVolume) ? savedVolume : DEFAULT_VOLUME;
  volumeSlider.value = String(startingVolume);
  audio.volume = startingVolume;

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

  const savedSearchQuery = typeof savedState.searchQuery === "string" ? savedState.searchQuery : "";
  state.searchQuery = savedSearchQuery;
  searchInput.value = savedSearchQuery;

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
  if (!isValidIndex(state.currentIndex)) {
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

volumeSlider.addEventListener("input", () => {
  const volume = clampNumber(Number(volumeSlider.value), 0, 1);
  audio.volume = volume;
  queueStateSave();
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
  playButton.textContent = "Pause";
});

audio.addEventListener("pause", () => {
  playButton.textContent = "Play";
});

audio.addEventListener("ended", () => {
  playNext(true);
});

audio.addEventListener("error", () => {
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
  }
});

window.addEventListener("beforeunload", () => {
  flushStateSave();
});

async function initializePlayer() {
  audio.volume = DEFAULT_VOLUME;
  updateNowPlayingMeta();
  updateModeButtons();
  renderPlaylist();
  await restorePersistedState();
}

initializePlayer();