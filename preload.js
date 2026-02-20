const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("songPlayerAPI", {
  pickFiles: () => ipcRenderer.invoke("library:pick-files"),
  pickFolder: () => ipcRenderer.invoke("library:pick-folder"),
  pickPlaylistCover: () => ipcRenderer.invoke("playlist:pick-cover"),
  resolveStreamLink: (url) => ipcRenderer.invoke("link:resolve", url),
  prepareLinkTrack: (url) => ipcRenderer.invoke("link:prepare-track", url),
  getTrackDetails: (filePath) => ipcRenderer.invoke("track:get-details", filePath),
  getStartupLaunch: () => ipcRenderer.invoke("system:get-startup-launch"),
  setStartupLaunch: (enabled) => ipcRenderer.invoke("system:set-startup-launch", enabled),
  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
});
