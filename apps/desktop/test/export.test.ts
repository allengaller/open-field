import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { ConsentRecord, Encounter, FieldEvent, verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault, TEST_PASSPHRASE } from './helpers';
import { ingestFile, sha256File } from '../src/main/services/ingest';
import { listEvidenceEntries } from '../src/main/services/evidence';
import { getArtifact, insertConsentRecord, insertEncounter, insertFieldEvent, withdrawConsent } from '../src/main/services/repos';
import { ExportError, exportBackup, makeCitation, readBackup, restoreBackup } from '../src/main/services/export';
import { openVault, resolveVaultPaths } from '../src/main/services/vault';
import { runVerify } from '../src/main/services/verify';

const { db, paths, home } = makeTestVault();
const fixDir = mkdtempSync(join(tmpdir(), 'of-exp-'));
const T0 = 1757376100000;

beforeAll(async () => {
  insertFieldEvent(db, FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '斗南花市' }));
  insertEncounter(db, Encounter.parse({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '关键知情人', startedAt: T0 }));
  insertEncounter(db, Encounter.parse({ id: 'enc-2', eventId: 'evt-1', participantRef: 'P02', samplingReason: '对照样本', startedAt: T0 }));
  insertEncounter(db, Encounter.parse({ id: 'enc-3', eventId: 'evt-1', participantRef: 'P03', samplingReason: '门禁用例（无同意）', startedAt: T0 }));
  insertEncounter(db, Encounter.parse({ id: 'enc-4', eventId: 'evt-1', participantRef: 'P04', samplingReason: '撤回用例', startedAt: T0 }));
  // 引用门禁：enc-1/enc-2 有有效录音同意，其余无
  insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-enc1', encounterId: 'enc-1', templateType: 'recording', scope: '仅用于学术研究' }));
  insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-enc2', encounterId: 'enc-2', templateType: 'recording', scope: '仅用于学术研究' }));
});

afterAll(() => {
  rmSync(fixDir, { recursive: true, force: true });
  cleanupTestVault(home);
});

async function ingestFixture(
  name: string,
  capturedAt?: number,
  encounterId?: string,
  opts: { type?: 'audio' | 'photo' | 'doc'; mime?: string } = {},
) {
  const src = join(fixDir, name);
  writeFileSync(src, name);
  return ingestFile(db, paths.originalsRoot, {
    sourcePath: src, mime: opts.mime ?? 'audio/wav', type: opts.type ?? 'audio', deviceId: 'desktop',
    ...(capturedAt !== undefined ? { capturedAt } : {}),
    ...(encounterId !== undefined ? { encounterId } : {}),
  });
}

describe('makeCitation', () => {
  it('seq 递增 + 偏移 = capturedAt-startedAt，EXPORT 入链', async () => {
    const r1 = await ingestFixture('a1.wav', T0 + 90_000, 'enc-1');
    const c1 = makeCitation(db, { artifactId: r1.artifact.id, actor: 'desktop', ts: T0 + 100_000 });
    expect(c1.refId).toBe('OF-20260909-KMG-001#T01:30');

    const r2 = await ingestFixture('a2.wav', T0 + 125_000, 'enc-1');
    const c2 = makeCitation(db, { artifactId: r2.artifact.id, actor: 'desktop' });
    expect(c2.refId).toBe('OF-20260909-KMG-002#T02:05');

    expect(listEvidenceEntries(db).at(-1)?.action).toBe('EXPORT');
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('偏移夹取到 0-5999（早于访谈起点 → T00:00，超一小时 → T99:59）', async () => {
    const r3 = await ingestFixture('a3.wav', T0 - 5_000, 'enc-2');
    expect(makeCitation(db, { artifactId: r3.artifact.id, actor: 'desktop' }).refId).toMatch(/#T00:00$/);
    const r4 = await ingestFixture('a4.wav', T0 + 7_000_000, 'enc-2');
    expect(makeCitation(db, { artifactId: r4.artifact.id, actor: 'desktop' }).refId).toMatch(/#T99:59$/);
  });

  it('未挂访谈的采集物拒绝引用', async () => {
    const r5 = await ingestFixture('a5.wav');
    expect(() => makeCitation(db, { artifactId: r5.artifact.id, actor: 'desktop' })).toThrow(/未挂访谈/);
  });

  it('重复引用同一 artifact 幂等返回既有 refId，不追加 EXPORT（A15）', async () => {
    const r = await ingestFixture('a6.wav', T0 + 150_000, 'enc-1');
    const first = makeCitation(db, { artifactId: r.artifact.id, actor: 'desktop' });
    const chainLen = listEvidenceEntries(db).length;
    const second = makeCitation(db, { artifactId: r.artifact.id, actor: 'desktop' });
    expect(second.refId).toBe(first.refId);
    expect(listEvidenceEntries(db).length).toBe(chainLen);
  });

  it('同意门禁：audio 无有效 recording 同意 → no-consent 拒绝', async () => {
    const r = await ingestFixture('g1.wav', T0 + 60_000, 'enc-3');
    expect(() => makeCitation(db, { artifactId: r.artifact.id, actor: 'desktop' })).toThrow(/知情同意/);
  });

  it('同意门禁：photo 需 portrait 同意，recording 不能替代；补记后放行', async () => {
    const r = await ingestFixture('g2.jpg', T0 + 60_000, 'enc-3', { type: 'photo', mime: 'image/jpeg' });
    expect(() => makeCitation(db, { artifactId: r.artifact.id, actor: 'desktop' })).toThrow(/知情同意/);
    insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-g2', encounterId: 'enc-3', templateType: 'portrait', scope: '论文插图' }));
    expect(makeCitation(db, { artifactId: r.artifact.id, actor: 'desktop' }).refId).toMatch(/^OF-/);
  });

  it('同意门禁：撤回后的同意立即失效，doc/note 类材料不受门禁限制', async () => {
    insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-g3', encounterId: 'enc-4', templateType: 'recording', scope: '仅用于学术研究' }));
    withdrawConsent(db, 'consent-g3', T0 + 200_000);
    const audio = await ingestFixture('g3.wav', T0 + 60_000, 'enc-4');
    expect(() => makeCitation(db, { artifactId: audio.artifact.id, actor: 'desktop' })).toThrow(/知情同意/);
    const note = await ingestFixture('g4.md', T0 + 60_000, 'enc-4', { type: 'doc', mime: 'text/markdown' });
    expect(makeCitation(db, { artifactId: note.artifact.id, actor: 'desktop' }).refId).toMatch(/^OF-/);
  });
});

describe('exportBackup / readBackup', () => {
  const outPath = join(paths.backupsDir, 'daily.ofbackup');

  it('加密容器可被正确口令解开，含 vault.db 与 originals', () => {
    exportBackup(db, paths, TEST_PASSPHRASE, outPath);
    const zip = new AdmZip(readBackup(outPath, TEST_PASSPHRASE));
    const names = zip.getEntries().map((e) => e.entryName);
    expect(names).toContain('vault.db');
    expect(names.some((n) => n.startsWith('originals/'))).toBe(true);
  });

  it('错误口令解包直接失败（GCM 认证拒绝）', () => {
    expect(() => readBackup(outPath, 'wrong-pass-999')).toThrow();
  });

  it('残留的临时 vault 文件不阻塞备份（A15）', () => {
    const retryPath = join(paths.backupsDir, 'retry.ofbackup');
    writeFileSync(`${retryPath}.tmp-vault.db`, 'stale-from-crash');
    exportBackup(db, paths, TEST_PASSPHRASE, retryPath);
    expect(existsSync(`${retryPath}.tmp-vault.db`)).toBe(false);
    expect(existsSync(retryPath)).toBe(true);
  });
});

describe('restoreBackup', () => {
  const backupPath = join(fixDir, 'loop.ofbackup');
  let ingestedId = '';

  beforeAll(async () => {
    const r = await ingestFixture('r1.wav', T0 + 300_000, 'enc-1');
    ingestedId = r.artifact.id;
    exportBackup(db, paths, 'backup-pass-123', backupPath);
  });

  it('备份 → 恢复到新目录 → 重开资料库：数据、封存件、只读位与证据链完整（闭环）', async () => {
    const target = mkdtempSync(join(tmpdir(), 'of-restore-'));
    try {
      restoreBackup({ backupPath, backupPassphrase: 'backup-pass-123', vaultPassphrase: TEST_PASSPHRASE, home: target });
      const targetPaths = resolveVaultPaths(target);
      const reopened = openVault(targetPaths, TEST_PASSPHRASE, false);
      try {
        const restored = getArtifact(reopened, ingestedId);
        expect(restored).toBeTruthy();
        expect(restored!.originalPath).toBe(join(targetPaths.originalsRoot, ingestedId, 'v1.wav')); // original_path 已重写到新家
        expect(await sha256File(restored!.originalPath)).toBe(restored!.sha256);
        expect(statSync(restored!.originalPath).mode & 0o222).toBe(0); // 只读封存保持
        const entries = listEvidenceEntries(reopened);
        expect(verifyChain(entries).ok).toBe(true);
        expect(entries.length).toBe(listEvidenceEntries(db).length);
        expect((await runVerify(reopened, targetPaths.originalsRoot)).issues).toEqual([]); // 校验服务在新家零问题
      } finally {
        reopened.close();
      }
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('目标目录已有资料库 → 拒绝覆盖', () => {
    const occupied = mkdtempSync(join(tmpdir(), 'of-restore-'));
    try {
      writeFileSync(join(occupied, 'vault.db'), 'existing');
      expect(() => restoreBackup({ backupPath, backupPassphrase: 'backup-pass-123', vaultPassphrase: TEST_PASSPHRASE, home: occupied })).toThrow(/拒绝覆盖/);
    } finally {
      rmSync(occupied, { recursive: true, force: true });
    }
  });

  it('备份口令错误 → 恢复失败，目标目录不落任何文件', () => {
    const target = mkdtempSync(join(tmpdir(), 'of-restore-'));
    try {
      expect(() => restoreBackup({ backupPath, backupPassphrase: 'wrong-backup-9', vaultPassphrase: TEST_PASSPHRASE, home: target })).toThrow();
      expect(existsSync(join(target, 'vault.db'))).toBe(false);
      expect(existsSync(join(target, 'originals'))).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it('资料库口令错误 → 恢复失败，目标目录不落任何文件', () => {
    const target = mkdtempSync(join(tmpdir(), 'of-restore-'));
    try {
      expect(() => restoreBackup({ backupPath, backupPassphrase: 'backup-pass-123', vaultPassphrase: 'wrong-vault-9', home: target })).toThrow();
      expect(existsSync(join(target, 'vault.db'))).toBe(false);
      expect(existsSync(join(target, 'originals'))).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
});
