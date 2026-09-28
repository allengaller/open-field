import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Encounter, FieldEvent, verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { listEvidenceEntries } from '../src/main/services/evidence';
import { getInboxItem, insertEncounter, insertFieldEvent, insertInboxItem, listArtifacts } from '../src/main/services/repos';
import { confirmInboxItem, guessArtifactType, ingestFile, IngestError, rejectInboxItem } from '../src/main/services/ingest';

const { db, paths, home } = makeTestVault();
const fixtures = mkdtempSync(join(tmpdir(), 'of-fix-'));
afterAll(() => {
  cleanupTestVault(home);
  rmSync(fixtures, { recursive: true, force: true });
});

// 迁移 v1 对 encounters.event_id / artifacts.encounter_id 声明了外键（foreign_keys=ON），先落父行
insertFieldEvent(db, FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '昆明篆新市场' }));
insertEncounter(db, Encounter.parse({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '雪球引荐', startedAt: 1757376100000 }));

function fixture(name: string, bytes: Buffer): string {
  const p = join(fixtures, name);
  writeFileSync(p, bytes);
  return p;
}

describe('guessArtifactType', () => {
  it('识别音频/照片/文档/笔记，未知扩展名拒绝猜测', () => {
    expect(guessArtifactType('a.wav')).toEqual({ type: 'audio', mime: 'audio/wav' });
    expect(guessArtifactType('b.HEIC').type).toBe('photo');
    expect(guessArtifactType('c.pdf').type).toBe('doc');
    expect(guessArtifactType('d.txt').type).toBe('note');
    expect(() => guessArtifactType('e.xyz')).toThrow(IngestError);
  });
});

describe('ingestFile', () => {
  it('完整流程：登记 + 封存只读 + 入链', async () => {
    const src = fixture('interview.wav', Buffer.from('fake-wav-bytes-1234567890'));
    const result = await ingestFile(db, paths.originalsRoot, {
      sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop', encounterId: 'enc-1', eventId: 'evt-1', ts: 1757376200000,
    });
    expect(result.status).toBe('ingested');
    const art = result.artifact;
    const stat = statSync(join(paths.originalsRoot, art.id, 'v1.wav'));
    expect(stat.mode & 0o222).toBe(0); // 只读
    expect(existsSync(join(paths.originalsRoot, art.id, 'v1.wav'))).toBe(true);
    const last = listEvidenceEntries(db).at(-1);
    expect(last?.action).toBe('INGEST_ARTIFACT');
    expect(last?.payloadHash).toBe(art.sha256);
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('同哈希重复导入 → duplicate，不产生第二条链目与第二个目录', async () => {
    const src = fixture('interview-copy.wav', Buffer.from('fake-wav-bytes-1234567890'));
    const first = listArtifacts(db).length;
    const result = await ingestFile(db, paths.originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop' });
    expect(result.status).toBe('duplicate');
    expect(listArtifacts(db).length).toBe(first);
  });

  it('空文件拒绝（防 iCloud 未下载完成的占位文件当原始件）', async () => {
    const src = fixture('empty.wav', Buffer.alloc(0));
    await expect(ingestFile(db, paths.originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop' })).rejects.toThrow(/空文件/);
  });

  it('登记事务失败（refId 唯一冲突）→ 已封存目录被补偿清理', async () => {
    const first = fixture('first.wav', Buffer.from('A'.repeat(512)));
    await ingestFile(db, paths.originalsRoot, {
      sourcePath: first, mime: 'audio/wav', type: 'audio', deviceId: 'desktop',
      refId: 'OF-20260909-KMG-001', artifactId: 'art-refid-1',
    });
    const second = fixture('refclash.wav', Buffer.from('B'.repeat(512)));
    await expect(
      ingestFile(db, paths.originalsRoot, {
        sourcePath: second, mime: 'audio/wav', type: 'audio', deviceId: 'desktop',
        refId: 'OF-20260909-KMG-001', // 与上一条冲突 → INSERT 失败 → 补偿删目录
        artifactId: 'art-refclash',
      }),
    ).rejects.toThrow();
    expect(existsSync(join(paths.originalsRoot, 'art-refclash'))).toBe(false);
  });

  it('capturedAt 未显式给出时回退为源文件 mtime', async () => {
    const src = fixture('mtime.wav', Buffer.from('C'.repeat(256)));
    const { artifact } = await ingestFile(db, paths.originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop' });
    expect(Math.abs(artifact.capturedAt - statSync(src).mtimeMs)).toBeLessThan(60_000);
  });
});

describe('confirmInboxItem / rejectInboxItem', () => {
  it('确认 → ingestFile → InboxItem 置 ingested 并回填 sha256', async () => {
    const src = fixture('confirm-me.wav', Buffer.from('D'.repeat(128)));
    insertInboxItem(db, { id: 'inb-c1', sourcePath: src, detectedAt: 1757376300000, status: 'pending' });
    const artifact = await confirmInboxItem(db, paths.originalsRoot, 'inb-c1', { deviceId: 'desktop', encounterId: 'enc-1' });
    expect(artifact.encounterId).toBe('enc-1');
    expect(getInboxItem(db, 'inb-c1')?.status).toBe('ingested');
    expect(getInboxItem(db, 'inb-c1')?.sha256).toBe(artifact.sha256);
  });

  it('拒绝 → 置 rejected，不再出现在 pending', () => {
    insertInboxItem(db, { id: 'inb-r1', sourcePath: '/tmp/never.wav', detectedAt: 1757376300000, status: 'pending' });
    rejectInboxItem(db, 'inb-r1');
    expect(getInboxItem(db, 'inb-r1')?.status).toBe('rejected');
  });
});
