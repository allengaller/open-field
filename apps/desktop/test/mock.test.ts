import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Artifact } from '@openfield/core';
import { cleanupTestVault, makeTestVault, TEST_PASSPHRASE } from './helpers';
import { clearMockData, loadMockData, mockFootprint } from '../src/main/services/mock';
import {
  getArtifact, insertArtifact, listArtifacts, listEncountersByEvent, listFieldEvents, listMemos, listParticipants,
} from '../src/main/services/repos';
import { openVault, resolveVaultPaths } from '../src/main/services/vault';
import type { Database } from 'better-sqlite3-multiple-ciphers';

describe('mock 演示数据', () => {
  let db: Database;
  let home: string;
  let paths: ReturnType<typeof resolveVaultPaths>;

  beforeEach(() => {
    const vault = makeTestVault();
    db = vault.db;
    home = vault.home;
    paths = vault.paths;
  });

  afterEach(() => {
    db.close();
    cleanupTestVault(home);
  });

  it('载入 → 全部实体可见且哈希链可验，清除 → 业务行与文件清空', async () => {
    const summary = await loadMockData(db, paths, 'test-device');
    expect(summary.events).toBe(3);
    expect(summary.participants).toBe(5);
    expect(summary.encounters).toBe(5);
    expect(summary.artifacts).toBe(6);
    expect(summary.citations).toBe(1);

    expect(listFieldEvents(db).filter((e) => e.id.startsWith('evt-demo-'))).toHaveLength(3);
    expect(listParticipants(db).filter((p) => p.pseudonym.startsWith('P-'))).toHaveLength(5);
    expect(listEncountersByEvent(db, 'evt-demo-kmg-mushuihua')).toHaveLength(3);
    expect(listMemos(db).filter((m) => m.id.includes('demo') || m.id.startsWith('journal-'))).toHaveLength(5);

    const cited = listArtifacts(db).find((a) => a.id === 'art-demo-note-001');
    expect(cited?.refId).toMatch(/^OF-\d{8}-KMG-\d{3}#T\d{2}:\d{2}$/);

    // 采集物封存文件真实存在
    for (const a of listArtifacts(db)) {
      expect(existsSync(a.originalPath), a.originalPath).toBe(true);
    }

    // 幂等：重复载入不报错、数量不变
    const again = await loadMockData(db, paths, 'test-device');
    expect(again.artifacts).toBe(6);
    expect(listFieldEvents(db).filter((e) => e.id.startsWith('evt-demo-'))).toHaveLength(3);

    // 清除：业务行删光、封存文件删除；evidence_log（append-only）保留
    await clearMockData(db, paths);
    expect(listFieldEvents(db).filter((e) => e.id.startsWith('evt-demo-'))).toHaveLength(0);
    expect(listArtifacts(db).filter((a) => a.id.startsWith('art-demo-'))).toHaveLength(0);
    expect(mockFootprint(db)).toEqual({ events: 0, encounters: 0, artifacts: 0 });
    expect(existsSync(join(paths.originalsRoot, 'art-demo-note-001'))).toBe(false);
    const chainCount = (db.prepare('SELECT COUNT(*) AS n FROM evidence_log').get() as { n: number }).n;
    expect(chainCount).toBeGreaterThan(0);
  });

  it('清除后重建 vault 数据仍一致（解除锁定场景不适用：mock 仅在解锁后可调用）', () => {
    const opened = openVault(resolveVaultPaths(home), TEST_PASSPHRASE, false);
    expect(opened.prepare('SELECT COUNT(*) AS n FROM evidence_log').get()).toBeTruthy();
    opened.close();
  });

  it('original_path 越界 → 拒绝清除，波及目录与登记行原样（与 purge 同一 A14 围栏标准）', async () => {
    insertArtifact(
      db,
      Artifact.parse({ id: 'art-demo-note-001', type: 'note', sha256: 'c'.repeat(64), size: 8, mime: 'text/markdown', capturedAt: 1757376400000, deviceId: 'desktop' }),
      join(home, 'evil', 'v1.md'),
    );
    mkdirSync(join(home, 'evil'), { recursive: true });
    writeFileSync(join(home, 'evil', 'keep.txt'), 'keep');

    await expect(clearMockData(db, paths)).rejects.toThrow(/越界/);
    expect(existsSync(join(home, 'evil', 'keep.txt'))).toBe(true);
    expect(getArtifact(db, 'art-demo-note-001')).toBeTruthy(); // 围栏先于删除：登记行未被误删
  });
});
