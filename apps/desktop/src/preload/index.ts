import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type IpcResult } from '../shared/ipc';

contextBridge.exposeInMainWorld('openfield', {
  invoke: (channel: string, payload?: unknown): Promise<IpcResult<unknown>> => {
    if (!(IPC_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.resolve({ ok: false, error: `未知 IPC 通道：${channel}` });
    }
    return ipcRenderer.invoke(channel, payload);
  },
  onInboxChanged: (cb: (summary: unknown) => void): void => {
    ipcRenderer.on('inbox:changed', (_event, summary) => cb(summary));
  },
  onVaultLocked: (cb: () => void): void => {
    ipcRenderer.on('vault:locked', () => cb());
  },
});
