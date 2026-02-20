const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("songPlayerAPI", {
  pickFiles: () => ipcRenderer.invoke("library:pick-files"),
  pickFolder: () => ipcRenderer.invoke("library:pick-folder"),
  getTrackDetails: (filePath) => ipcRenderer.invoke("track:get-details", filePath),
  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
});
