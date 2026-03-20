const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Vaso',
    icon: path.join(__dirname, '..', 'public', 'favicon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove default menu bar
  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// IPC: Native file save dialog for STL export
ipcMain.handle('save-stl', async (_event, buffer) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter STL',
    defaultPath: `vaso_export_${Date.now()}.stl`,
    filters: [{ name: 'STL Files', extensions: ['stl'] }],
  });

  if (canceled || !filePath) return { success: false };

  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
