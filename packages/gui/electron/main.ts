import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { socketPath } from '@fizz/core';
import { DaemonClient } from './daemon-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
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
      // sandbox:false lets the preload script use ESM (vite bundles it as ESM
      // since the workspace is "type": "module"). Sandboxed preloads must be
      // CJS which fights the rest of the toolchain. Trade-off: weaker
      // sandboxing of renderer (no extra OS-level isolation beyond Chromium's),
      // which is acceptable for a local RGB controller talking to localhost.
      sandbox: false,
    },
  });

  // In dev, VITE_DEV_SERVER_URL is set by vite-plugin-electron. Fall back to
  // hardcoded dev URL if the env var didn't propagate (some plugin versions
  // don't export it reliably). Production build: loadFile of bundled dist.
  const isDev = !app.isPackaged;
  const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? (isDev ? 'http://localhost:5173' : undefined);
  console.log('[fizzd-gui] dev mode:', isDev, 'loading URL:', devUrl ?? 'dist/index.html');

  if (devUrl) {
    try {
      await mainWindow.loadURL(devUrl);
      mainWindow.webContents.openDevTools({ mode: 'right' });
    } catch (err) {
      console.error('[fizzd-gui] loadURL failed:', (err as Error).message);
    }
  } else {
    await mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }

  // Hide to tray on close instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Always log if renderer fails to load
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
    console.error('[fizzd-gui] did-fail-load:', errorCode, errorDesc, validatedURL);
  });
  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[renderer ${event.level}]`, event.message, event.sourceId ? `@${event.sourceId}:${event.lineNumber}` : '');
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[fizzd-gui] render-process-gone:', details);
  });
  // Capture unhandled errors from the renderer (would otherwise be silent)
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error('[fizzd-gui] preload-error:', preloadPath, error);
  });
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
ipcMain.handle('fizz:perkeySet', (_e, colors: Record<string, string>) =>
  daemon.call('perkey.set', { colors }));
ipcMain.handle('fizz:perkeyStartPattern', (_e, pattern) =>
  daemon.call('perkey.startPattern', pattern));
ipcMain.handle('fizz:perkeyStopPattern', () =>
  daemon.call('perkey.stopPattern', {}));

// === Daemon notifications → forward to renderer ===
daemon.on('effect.changed', (params) => {
  mainWindow?.webContents.send('fizz:effectChanged', params);
});
daemon.on('device.changed', (params) => {
  mainWindow?.webContents.send('fizz:deviceChanged', params);
});

function setupTray() {
  // Minimal 16x16 magenta PNG for the tray icon — replace with a real asset later.
  const iconBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOUlEQVR42mNk+M9Q/x8DjMzAxIDOZmJk+M+ABgZ1AyMTw1AaGRkY/jMy/v//n4GBgYGRkRHbAACWAQqp1ZGqGAAAAABJRU5ErkJggg==',
    'base64',
  );

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromBuffer(iconBuffer);
  } catch {
    // Fallback: empty image — tray still works on Linux via tooltip+menu
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Fizz RGB');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar Fizz', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Parar efeito', click: () => { daemon.call('effect.stop', {}).catch(() => {}); } },
    { label: 'Apagar teclas (perkey off)', click: () => { daemon.call('perkey.stopPattern', {}).catch(() => {}); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  setupTray();
  daemon.connect().catch((err: Error) => console.error('Initial daemon connection failed:', err.message));
});

// Keep app running in tray when all windows are closed
// (window-all-closed fires but we do not quit — app stays alive in the tray)
app.on('window-all-closed', () => {
  // intentionally no-op: app keeps running in tray
});

app.on('before-quit', () => {
  daemon.close();
});
