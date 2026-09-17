import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsentRecord, Encounter, FieldEvent } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { ingestFile } from '../src/main/services/ingest';
import { insertConsentRecord, insertEncounter, insertFieldEvent } from '../src/main/services/repos';
import { makeCitation } from '../src/main/services/export';
import { purgeSubject } from '../src/main/services/purge';

// 回归：refId 序号由 ref_sequences 单调分配，purge 不回收序号。
// 历史 bug：按现存 artifacts 计数续号，purge 后轻则永久冲突（重试无效），重则复用已发表引用号。
const { db, paths, home } = makeTestVault();
const fixDir = mkdtempSync(join(tmpdir(), 'of-rid-'));
const T0 = 1757376100000;

beforeAll(() => {
  insertFieldEvent(db, FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '测试市场' }));
  insertEncounter(db, Encounter.parse({ id: 'enc-p1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '抽样', startedAt: T0 }));
  insertEncounter(db, Encounter.parse({ id: 'enc-p2', eventId: 'evt-1', participantRef: 'P02', samplingReason: '抽样', startedAt: T0 }));
  insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-p1', encounterId: 'enc-p1', templateType: 'recording', scope: '研究' }));
  insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-p2', encounterId: 'enc-p2', templateType: 'recording', scope: '研究' }));
});

afterAll(() => {
  rmSync(fixDir, { recursive: true, force: true });
  cleanupTestVault(home);
});

async function ingest(name: string, encounterId: string) {
  const src = join(fixDir, name);
  writeFileSync(src, name);
  return ingestFile(db, paths.originalsRoot, {
    sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop', capturedAt: T0 + 60_000, encounterId,
  });
}

describe('refId 序号分配（purge 后不复用、不冲突）', () => {
  it('场景 A：purge 低序号后重新签发继续递增，不触发唯一索引冲突', async () => {
    const a1 = await ingest('r1.wav', 'enc-p1');
    expect(makeCitation(db, { artifactId: a1.artifact.id, actor: 'desktop' }).refId).toBe('OF-20260909-KMG-001#T01:00');
    const a2 = await ingest('r2.wav', 'enc-p2');
    expect(makeCitation(db, { artifactId: a2.artifact.id, actor: 'desktop' }).refId).toBe('OF-20260909-KMG-002#T01:00');

    purgeSubject(db, paths.originalsRoot, { pseudonym: 'P01', confirmToken: 'P01', actor: 'desktop' }); // 删除 001

    const a3 = await ingest('r3.wav', 'enc-p2');
    const c3 = makeCitation(db, { artifactId: a3.artifact.id, actor: 'desktop' });
    expect(c3.refId).toBe('OF-20260909-KMG-003#T01:00');
  });

  it('场景 B：purge 掉最高序号后新签发不复用该序号', async () => {
    // 现状：002(a2)、003(a3) 属 P02；purge 后同前缀已签发历史最高为 003
    purgeSubject(db, paths.originalsRoot, { pseudonym: 'P02', confirmToken: 'P02', actor: 'desktop' });

    insertEncounter(db, Encounter.parse({ id: 'enc-p3', eventId: 'evt-1', participantRef: 'P03', samplingReason: '抽样', startedAt: T0 }));
    insertConsentRecord(db, ConsentRecord.parse({ id: 'consent-p3', encounterId: 'enc-p3', templateType: 'recording', scope: '研究' }));
    const a4 = await ingest('r4.wav', 'enc-p3');
    const c4 = makeCitation(db, { artifactId: a4.artifact.id, actor: 'desktop' });
    expect(c4.refId).toBe('OF-20260909-KMG-004#T01:00');

    const row = db.prepare('SELECT last_seq FROM ref_sequences WHERE date_city = ?').get('20260909-KMG') as { last_seq: number };
    expect(row.last_seq).toBe(4); // 序号水位由 ref_sequences 独立留存，未随 purge 回退
  });
});
