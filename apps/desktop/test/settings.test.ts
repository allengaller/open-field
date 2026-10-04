import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTestVault, makeTestVault } from './helpers';
import { AppState } from '../src/main/state';
import { createIpcHandlers } from '../src/main/ipc';
import { actorIdOf, DEFAULT_AUTO_LOCK_MINUTES, getSettings, setAutoLockMinutes, setDeviceAlias } from '../src/main/services/settings';
import type { Database } from 'better-sqlite3-multiple-ciphers';

describe('应用级设置（A34）', () => {
  let db: Database | null = null;
  let home: string | null = null;

  afterEach(() => {
    db?.close();
    if (home) cleanupTestVault(home);
    db = null;
    home = null;
  });

  it('默认值：未设代号回落 null（运行时回落主机名），自动锁定 15 分钟', () => {
    const v = makeTestVault();
    db = v.db;
    home = v.home;
    expect(getSettings(v.db)).toEqual({ deviceAlias: null, autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES });
  });

  it('设置代号与分钟数可读回；空串清除代号', () => {
    const v = makeTestVault();
    db = v.db;
    home = v.home;
    setDeviceAlias(v.db, '田野机-A');
    setAutoLockMinutes(v.db, 30);
    expect(getSettings(v.db)).toEqual({ deviceAlias: '田野机-A', autoLockMinutes: 30 });
    setDeviceAlias(v.db, '');
    expect(getSettings(v.db).deviceAlias).toBeNull();
  });

  it('非法值拒绝：含 | 的代号、非整数分钟、越界分钟', () => {
    const v = makeTestVault();
    db = v.db;
    home = v.home;
    expect(() => setDeviceAlias(v.db, 'a|b')).toThrow(/不合法/);
    expect(() => setAutoLockMinutes(v.db, -1)).toThrow(/不合法/);
    expect(() => setAutoLockMinutes(v.db, 1.5)).toThrow(/不合法/);
    expect(() => setAutoLockMinutes(v.db, 1441)).toThrow(/不合法/);
  });

  it('actorIdOf：代号优先，未设回落', () => {
    const v = makeTestVault();
    db = v.db;
    home = v.home;
    expect(actorIdOf(v.db, 'host-fallback')).toBe('host-fallback');
    setDeviceAlias(v.db, '田野机-B');
    expect(actorIdOf(v.db, 'host-fallback')).toBe('田野机-B');
  });

  it('AppState.actorId：未解锁回落主机名，解锁后取代号；IPC settings:set 后 actor 生效', async () => {
    home = mkdtempSync(join(tmpdir(), 'of-settings-'));
    const state = new AppState(home);
    const h = createIpcHandlers(state);
    expect(state.actorId).toBe(state.deviceId); // 锁定态：读不到 app_settings，回落 hostname
    state.createVault('passphrase-1234');
    const saved = (await h['settings:set']({ deviceAlias: '田野机-C', autoLockMinutes: 20 })) as {
      ok: true;
      data: { deviceAlias: string; autoLockMinutes: number };
    };
    expect(saved.data).toEqual({ deviceAlias: '田野机-C', autoLockMinutes: 20 });
    expect(state.actorId).toBe('田野机-C');
    state.close();
    expect(state.actorId).toBe(state.deviceId);
  });
});
