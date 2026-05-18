import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { socketPath } from '@fizz/core';
import { DaemonClient } from './daemon-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const daemon = new DaemonClient(socketPath());

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0e0e12',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In dev, VITE_DEV_SERVER_URL is set by vite-plugin-electron
  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }
}

// === IPC handlers — forward to daemon ===

ipcMain.handle('fizz:daemonVersion', () => daemon.call('daemon.version', {}));
ipcMain.handle('fizz:deviceStatus', () => daemon.call('device.status', {}));
ipcMain.handle('fizz:effectList', () => daemon.call('effect.list', {}));
ipcMain.handle('fizz:effectRun', (_e, name: string, params: unknown) =>
  daemon.call('effect.run', { name, params }));
ipcMain.handle('fizz:effectStop', () => daemon.call('effect.stop', {}));
ipcMain.handle('fizz:effectCurrent', () => daemon.call('effect.current', {}));
ipcMain.handle('fizz:solidSet', (_e, color: string) =>
  daemon.call('solid.set', { color }));
ipcMain.handle('fizz:profileList', () => daemon.call('profile.list', {}));
ipcMain.handle('fizz:profileActivate', (_e, name: string) =>
  daemon.call('profile.activate', { name }));
ipcMain.handle('fizz:profileSave', (_e, key: string, profile: unknown) =>
  daemon.call('profile.save', { name: key, profile }));
ipcMain.handle('fizz:profileDelete', (_e, name: string) =>
  daemon.call('profile.delete', { name }));

// === Daemon notifications → forward to renderer ===
daemon.on('effect.changed', (params) => {
  mainWindow?.webContents.send('fizz:effectChanged', params);
});
daemon.on('device.changed', (params) => {
  mainWindow?.webContents.send('fizz:deviceChanged', params);
});

app.whenReady().then(() => {
  createWindow();
  daemon.connect().catch((err: Error) => console.error('Initial daemon connection failed:', err.message));
});

app.on('window-all-closed', () => {
  // For scaffolding phase: quit on close; tray background mode lands in Batch 4
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  daemon.close();
});
