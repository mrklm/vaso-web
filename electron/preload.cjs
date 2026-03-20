const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveSTL: (buffer) => ipcRenderer.invoke('save-stl', buffer),
  isElectron: true,
});
