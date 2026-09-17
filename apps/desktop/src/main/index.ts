import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { resolveHome } from './home';
import { AppState } from './state';
import { createIpcHandlers } from './ipc';
import { startInboxWatcher } from './watcher';
import { IPC_CHANNELS } from '../shared/ipc';

const state = new AppState(resolveHome(process.argv, join(app.getPath('userData'), 'openfield')));
let stopWatcher: (() => void) | null = null;

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
    ipcMain.handle(channel, (_event, payload: unknown) => handlers[channel](payload));
  }
  const win = createWindow();
  stopWatcher = startInboxWatcher(state, (s) => win.webContents.send('inbox:changed', s));
});

app.on('window-all-closed', () => {
  stopWatcher?.();
  state.close();
  app.quit();
});
