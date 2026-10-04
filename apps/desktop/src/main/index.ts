import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { resolveHome } from './home';
import { AppState } from './state';
import { createIpcHandlers } from './ipc';
import { startInboxWatcher } from './watcher';
import { getSettings } from './services/settings';
import { IPC_CHANNELS } from '../shared/ipc';

const state = new AppState(resolveHome(process.argv, join(app.getPath('userData'), 'openfield')));
let stopWatcher: (() => void) | null = null;

// A37 会话自动锁定：任意 IPC 活动刷新 lastActivity，空闲超过 app_settings.auto_lock_minutes
// （0=关闭）即关库并向 renderer 广播 vault:locked。tick 内读设置失败不臆断锁定（静默重试）。
const IDLE_TICK_MS = 30_000;
let lastActivity = Date.now();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#fafbfd',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 外链白名单：renderer 被攻破时不能被当任意 URL 开启器用（钓鱼跳板）。
  // 只放行项目官网与 GitHub 仓库；其余一律丢弃（窗口本身仍一律 deny）。
  const EXTERNAL_HOSTS = new Set(['jvvil0otgnr4.meoo.fun', 'github.com']);
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && EXTERNAL_HOSTS.has(parsed.hostname)) {
        void shell.openExternal(url);
      }
    } catch {
      // 非法 URL：直接忽略
    }
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

void app.whenReady().then(() => {
  const handlers = createIpcHandlers(state);
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (_event, payload: unknown) => {
      lastActivity = Date.now();
      return handlers[channel](payload);
    });
  }
  const win = createWindow();
  stopWatcher = startInboxWatcher(state, (s) => win.webContents.send('inbox:changed', s));

  const idleTimer = setInterval(() => {
    if (!state.unlocked) return;
    let minutes: number;
    try {
      minutes = getSettings(state.getDb()).autoLockMinutes;
    } catch {
      return;
    }
    if (minutes <= 0) return;
    if (Date.now() - lastActivity > minutes * 60_000) {
      state.close();
      lastActivity = Date.now();
      if (!win.isDestroyed()) win.webContents.send('vault:locked');
    }
  }, IDLE_TICK_MS);

  app.on('will-quit', () => clearInterval(idleTimer));
});

app.on('window-all-closed', () => {
  stopWatcher?.();
  state.close();
  app.quit();
});
