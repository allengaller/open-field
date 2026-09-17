import { describe, it, expect } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTestVault, makeTestVault } from './helpers';
import { ingestFile } from '../src/main/services/ingest';
import { listArtifacts } from '../src/main/services/repos';
import { runVerify } from '../src/main/services/verify';

async function seededVault(): Promise<{ home: string; originalsRoot: string; db: ReturnType<typeof makeTestVault>['db'] }> {
  const { db, paths, home } = makeTestVault();
  const fixDir = mkdtempSync(join(tmpdir(), 'of-vfy-'));
  const src = join(fixDir, 'a.wav');
  writeFileSync(src, 'V'.repeat(256));
  await ingestFile(db, paths.originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop' });
  rmSync(fixDir, { recursive: true, force: true });
  return { home, originalsRoot: paths.originalsRoot, db };
}

describe('runVerify', () => {
  it('干净 vault：链完整、issues 为空', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const report = await runVerify(db, originalsRoot);
      expect(report.chainOk).toBe(true);
      expect(report.chainBrokenAt).toBeNull();
      expect(report.issues).toEqual([]);
      expect(report.artifactCount).toBe(1);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('未启用锚点（不传 anchorPath）→ 报告不含 anchor-* 条目，行为不变', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const report = await runVerify(db, originalsRoot);
      expect(report.issues.filter((i) => i.kind.startsWith('anchor-'))).toEqual([]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('链头锚点：首次校验静默建立；链尾截断（内部自洽）在下次校验中可检出（Plan 1 终审义务）', async () => {
    const { db, originalsRoot, home } = await seededVault();
    const anchorPath = join(home, 'chain-anchor.json');
    try {
      const first = await runVerify(db, originalsRoot, { anchorPath });
      expect(first.issues).toEqual([]); // 首次校验建立锚点，不产生噪音
      expect(existsSync(anchorPath)).toBe(true);

      // 绕过 append-only 触发器截掉链尾：截断后的链内部仍自洽，chainOk 发现不了
      const last = db.prepare('SELECT MAX(seq) AS seq FROM evidence_log').get() as { seq: number };
      db.exec('DROP TRIGGER evidence_log_no_delete;');
      db.prepare('DELETE FROM evidence_log WHERE seq = ?').run(last.seq);

      const second = await runVerify(db, originalsRoot, { anchorPath });
      expect(second.chainOk).toBe(true); // 这正是锚点存在的理由：链自洽 ≠ 链完整
      expect(second.issues).toEqual([expect.objectContaining({ kind: 'anchor-mismatch' })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('锚点之后正常追加 → 不算 mismatch，锚点刷新到新链头', async () => {
    const { db, originalsRoot, home } = await seededVault();
    const anchorPath = join(home, 'chain-anchor.json');
    const fixDir = mkdtempSync(join(tmpdir(), 'of-vfy-'));
    try {
      await runVerify(db, originalsRoot, { anchorPath });
      const src = join(fixDir, 'b.wav');
      writeFileSync(src, 'W'.repeat(256));
      await ingestFile(db, originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop' });

      const report = await runVerify(db, originalsRoot, { anchorPath });
      expect(report.issues).toEqual([]);
      const last = db.prepare('SELECT entry_hash FROM evidence_log ORDER BY seq DESC LIMIT 1').get() as { entry_hash: string };
      const anchor = JSON.parse(readFileSync(anchorPath, 'utf8')) as { head: string };
      expect(anchor.head).toBe(last.entry_hash);
    } finally {
      rmSync(fixDir, { recursive: true, force: true });
      cleanupTestVault(home);
    }
  });

  it('锚点文件损坏 → anchor-unreadable，且不被静默覆写（保留现场）', async () => {
    const { db, originalsRoot, home } = await seededVault();
    const anchorPath = join(home, 'chain-anchor.json');
    try {
      await runVerify(db, originalsRoot, { anchorPath });
      writeFileSync(anchorPath, 'corrupted{');
      const report = await runVerify(db, originalsRoot, { anchorPath });
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'anchor-unreadable' })]);
      expect(readFileSync(anchorPath, 'utf8')).toBe('corrupted{');
    } finally {
      cleanupTestVault(home);
    }
  });

  it('原始件被改动 → hash-mismatch 指向该 artifact', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const art = listArtifacts(db)[0]!;
      chmodSync(art.originalPath, 0o644);
      writeFileSync(art.originalPath, 'tampered-after-seal');
      const report = await runVerify(db, originalsRoot);
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'hash-mismatch', artifactId: art.id })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('原始件文件被删 → original-missing', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      const art = listArtifacts(db)[0]!;
      rmSync(art.originalPath);
      const report = await runVerify(db, originalsRoot);
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'original-missing', artifactId: art.id })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('originals 下出现未登记目录 → orphan-directory', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      mkdirSync(join(originalsRoot, 'not-an-artifact'));
      const report = await runVerify(db, originalsRoot);
      expect(report.issues).toEqual([expect.objectContaining({ kind: 'orphan-directory', path: expect.stringContaining('not-an-artifact') })]);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('evidence_log 被篡改 → chainOk=false 且 brokenAt 定位到 seq', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      db.exec('DROP TRIGGER evidence_log_no_update; DROP TRIGGER evidence_log_no_delete;'); // A7：模拟越权篡改
      db.prepare('UPDATE evidence_log SET payload_hash = ? WHERE seq = 0').run('f'.repeat(64));
      const report = await runVerify(db, originalsRoot);
      expect(report.chainOk).toBe(false);
      expect(report.chainBrokenAt).toBe(0);
    } finally {
      cleanupTestVault(home);
    }
  });

  it('originals 整目录消失 → original-missing 与目录不可读均入报告，不抛出（A11）', async () => {
    const { db, originalsRoot, home } = await seededVault();
    try {
      rmSync(originalsRoot, { recursive: true, force: true });
      const report = await runVerify(db, originalsRoot);
      expect(report.chainOk).toBe(true);
      expect(report.issues).toEqual([
        expect.objectContaining({ kind: 'original-missing' }),
        expect.objectContaining({ kind: 'unreadable', path: originalsRoot }),
      ]);
    } finally {
      cleanupTestVault(home);
    }
  });
});
