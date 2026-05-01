const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveSTL: (buffer, filename) => ipcRenderer.invoke('save-stl', buffer, filename),
  isElectron: true,
});
