import { describe, it, expect, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTestVault } from './helpers';
import { Artifact } from '@openfield/core';
import { insertArtifact, insertMemo, listInboxItems } from '../src/main/services/repos';
import { exportBackup } from '../src/main/services/export';
import { VaultError } from '../src/main/services/vault';
import { AppState } from '../src/main/state';
import { createIpcHandlers } from '../src/main/ipc';
import { startInboxWatcher } from '../src/main/watcher';
import { resolveHome } from '../src/main/home';

const home = mkdtempSync(join(tmpdir(), 'of-shell-'));
afterAll(() => cleanupTestVault(home));

describe('resolveHome', () => {
  it('解析 --openfield-home= 参数，缺省回退', () => {
    expect(resolveHome(['electron', '.', '--openfield-home=/tmp/ofx'], 'fallback')).toBe('/tmp/ofx');
    expect(resolveHome(['electron', '.'], 'fallback')).toBe('fallback');
    expect(resolveHome(['--openfield-home='], 'fallback')).toBe('fallback');
  });
});

describe('AppState', () => {
  it('create → status unlocked → close → reopen，错口令抛 VaultError', () => {
    const state = new AppState(join(home, 's1'));
    expect(state.status().unlocked).toBe(false);
    state.createVault('passphrase-1234');
    expect(state.status()).toMatchObject({ hasVault: true, unlocked: true });
    state.close();
    expect(state.status().unlocked).toBe(false);

    state.openVault('passphrase-1234');
    expect(state.unlocked).toBe(true);
    state.close();

    expect(() => new AppState(join(home, 's1')).openVault('wrong-pass-999')).toThrow(VaultError);
  });

  it('未解锁时 getDb 抛错', () => {
    const state = new AppState(join(home, 's2'));
    expect(() => state.getDb()).toThrow(/未解锁/);
  });
});

describe('createIpcHandlers 端到端（main 进程同款调用序列）', () => {
  it('建库 → 登记 → 扫描 → 确认 → 校验 → 引用 全链 ok:true', async () => {
    const state = new AppState(join(home, 's3'));
    const h = createIpcHandlers(state);

    const created = await h['vault:create']({ passphrase: 'passphrase-1234' });
    expect(created).toMatchObject({ ok: true });

    expect(await h['events:create']({ id: 'evt-1', date: '2026-09-11', cityCode: 'KMG', locationName: '篆新市场' })).toMatchObject({ ok: true });
    expect(await h['encounters:create']({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '目的性抽样', startedAt: Date.now() })).toMatchObject({ ok: true });
    // 引用门禁：录音材料需有效 recording 同意
    expect(await h['consents:record']({ encounterId: 'enc-1', templateType: 'recording', scope: '学术研究' })).toMatchObject({ ok: true });

    writeFileSync(join(state.paths.inboxDir, 'rec.wav'), Buffer.from('S'.repeat(128)));
    const scan = await h['inbox:scan'](undefined);
    expect(scan).toMatchObject({ ok: true });

    const pending = (await h['inbox:list']({ status: 'pending' })) as { ok: true; data: { id: string }[] };
    expect(pending.data).toHaveLength(1);
    const confirmed = await h['inbox:confirm']({ itemId: pending.data[0]!.id, encounterId: 'enc-1' });
    expect(confirmed).toMatchObject({ ok: true });

    const verify = (await h['verify:run'](undefined)) as { ok: true; data: { chainOk: boolean; issues: unknown[] } };
    expect(verify.data.chainOk).toBe(true);
    expect(verify.data.issues).toEqual([]);

    const artifactId = (confirmed as { ok: true; data: { id: string } }).data.id;
    const cite = await h['citation:make']({ artifactId });
    expect(cite.ok).toBe(true);

    state.close();
  });

  it('非法入参 → ok:false + 错误信息（不抛穿 IPC 边界）', async () => {
    const state = new AppState(join(home, 's4'));
    const h = createIpcHandlers(state);
    const bad = await h['events:create']({ oops: true });
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/.+/) });
    state.close();
  });

  it('backup:restore：解锁时拒绝；覆盖已有库拒绝；空目录恢复成功且数据随备份回来', async () => {
    const state = new AppState(join(home, 's7'));
    const h = createIpcHandlers(state);
    state.createVault('passphrase-1234');
    expect(await h['events:create']({ id: 'evt-r', date: '2026-09-17', cityCode: 'HZS', locationName: '曹县' })).toMatchObject({ ok: true });
    const backupPath = join(state.paths.backupsDir, 'rt.ofbackup');
    exportBackup(state.getDb(), state.paths, 'backup-pass-123', backupPath);

    const refused = await h['backup:restore']({ backupPath, backupPassphrase: 'backup-pass-123', vaultPassphrase: 'passphrase-1234' });
    expect(refused).toMatchObject({ ok: false }); // 解锁状态恢复 = 覆盖正在使用的库，必须拒绝

    state.close();
    const covered = await h['backup:restore']({ backupPath, backupPassphrase: 'backup-pass-123', vaultPassphrase: 'passphrase-1234' });
    expect(covered).toMatchObject({ ok: false, error: expect.stringMatching(/拒绝覆盖/) }); // home 已有 vault.db

    const fresh = new AppState(join(home, 's7-fresh'));
    const restored = await createIpcHandlers(fresh)['backup:restore']({ backupPath, backupPassphrase: 'backup-pass-123', vaultPassphrase: 'passphrase-1234' });
    expect(restored).toMatchObject({ ok: true });
    expect(fresh.hasVault()).toBe(true);
    fresh.openVault('passphrase-1234');
    expect(fresh.status().events).toBe(1); // 备份里的登记随恢复回来
    fresh.close();
  });

  it('archive:detail 只返回该访谈关联的备忘录（原为全馆列表）', async () => {
    const state = new AppState(join(home, 's8'));
    const h = createIpcHandlers(state);
    state.createVault('passphrase-1234');
    expect(await h['events:create']({ id: 'evt-d', date: '2026-09-17', cityCode: 'HZS', locationName: '曹县' })).toMatchObject({ ok: true });
    expect(await h['encounters:create']({ id: 'enc-d1', eventId: 'evt-d', participantRef: 'P01', samplingReason: '关键知情人', startedAt: Date.now() })).toMatchObject({ ok: true });
    expect(await h['encounters:create']({ id: 'enc-d2', eventId: 'evt-d', participantRef: 'P02', samplingReason: '对照', startedAt: Date.now() })).toMatchObject({ ok: true });

    const db = state.getDb();
    const mkArt = (id: string, encounterId: string, sha: string): void =>
      insertArtifact(db, Artifact.parse({ id, encounterId, type: 'note', sha256: sha, size: 4, mime: 'text/plain', capturedAt: 1757376400000, deviceId: 'desktop' }), '/nowhere');
    mkArt('art-d1', 'enc-d1', 'd'.repeat(64));
    mkArt('art-d2', 'enc-d2', 'e'.repeat(64));
    insertMemo(db, { id: 'memo-d1', linkedArtifactIds: ['art-d1'], type: 'analytical', themes: [], content: '价格波动', createdAt: 1757376500000, confirmedAt: null });
    insertMemo(db, { id: 'memo-d2', linkedArtifactIds: ['art-d2'], type: 'quicknote', themes: [], content: '批发商口径', createdAt: 1757376500000, confirmedAt: null });
    insertMemo(db, { id: 'journal-d', linkedArtifactIds: [], type: 'daily', themes: [], content: '当日田野日志', createdAt: 1757376500000, confirmedAt: null });

    const detail = (await h['archive:detail']({ encounterId: 'enc-d1' })) as { ok: true; data: { memos: { id: string }[] } };
    expect(detail.data.memos.map((m) => m.id)).toEqual(['memo-d1']);
    state.close();
  });
});

describe('startInboxWatcher', () => {
  it('inbox 落入新文件 → 防抖后自动 scanOnce', async () => {
    const state = new AppState(join(home, 's5'));
    state.createVault('passphrase-1234');
    const summaries: unknown[] = [];
    const stop = startInboxWatcher(state, (s) => summaries.push(s));
    try {
      await new Promise((r) => setTimeout(r, 50)); // A16：chokidar 异步武装，立即写入会被初始扫描当已有文件吞掉
      writeFileSync(join(state.paths.inboxDir, 'watched.wav'), Buffer.from('W'.repeat(64)));
      await vi.waitFor(() => expect(listInboxItems(state.getDb(), 'pending')).toHaveLength(1), { timeout: 10_000, interval: 100 });
    } finally {
      stop();
      state.close();
    }
  });

  it('inbox 目录不存在时启动 watcher 仍能自动扫描（A16）', async () => {
    const state = new AppState(join(home, 's6'));
    state.createVault('passphrase-1234');
    rmSync(state.paths.inboxDir, { recursive: true, force: true });
    const stop = startInboxWatcher(state, () => {});
    try {
      await new Promise((r) => setTimeout(r, 50));
      writeFileSync(join(state.paths.inboxDir, 'late.wav'), Buffer.from('L'.repeat(64)));
      await vi.waitFor(() => expect(listInboxItems(state.getDb(), 'pending')).toHaveLength(1), { timeout: 10_000, interval: 100 });
    } finally {
      stop();
      state.close();
    }
  });
});
