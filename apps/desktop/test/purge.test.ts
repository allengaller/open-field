import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Artifact, computePayloadHash, Encounter, FieldEvent, Participant, verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { ingestFile } from '../src/main/services/ingest';
import { listEvidenceEntries } from '../src/main/services/evidence';
import {
  getArtifact, getEncounter, getParticipant, getRealName, insertArtifact, insertConsentRecord, insertEncounter,
  insertFieldEvent, insertMemo, listMemos, setRealName, upsertParticipant,
} from '../src/main/services/repos';
import { purgeSubject } from '../src/main/services/purge';

const { db, paths, home } = makeTestVault();
const fixDir = mkdtempSync(join(tmpdir(), 'of-purge-'));
let artifactId = '';

beforeAll(async () => {
  upsertParticipant(db, Participant.parse({ pseudonym: 'P01', industry: '花卉批发' }));
  upsertParticipant(db, Participant.parse({ pseudonym: 'P02', industry: '花卉零售' }));
  insertFieldEvent(db, FieldEvent.parse({ id: 'evt-1', date: '2026-09-09', cityCode: 'KMG', locationName: '斗南花市' }));
  insertEncounter(db, Encounter.parse({ id: 'enc-1', eventId: 'evt-1', participantRef: 'P01', samplingReason: '关键知情人', startedAt: 1757376100000 }));
  insertEncounter(db, Encounter.parse({ id: 'enc-2', eventId: 'evt-1', participantRef: 'P02', samplingReason: '对照样本', startedAt: 1757376200000 }));
  insertConsentRecord(db, { id: 'con-1', encounterId: 'enc-1', templateType: 'recording', scope: '仅本研究', withdrawnAt: null });
  setRealName(db, 'P01', '张三', 1757376000000);
  const src = join(fixDir, 'p01-interview.wav');
  writeFileSync(src, 'P'.repeat(512));
  const { artifact } = await ingestFile(db, paths.originalsRoot, { sourcePath: src, mime: 'audio/wav', type: 'audio', deviceId: 'desktop', encounterId: 'enc-1' });
  artifactId = artifact.id;
  insertMemo(db, { id: 'memo-1', linkedArtifactIds: [artifact.id], type: 'quicknote', themes: [], content: '受访者提到价格波动', createdAt: 1757376300000, confirmedAt: null });
});

afterAll(() => {
  rmSync(fixDir, { recursive: true, force: true });
  cleanupTestVault(home);
});

describe('purgeSubject', () => {
  it('confirmToken 不一致直接拒绝', () => {
    expect(() => purgeSubject(db, paths.originalsRoot, { pseudonym: 'P01', confirmToken: 'p01', actor: 'desktop' })).toThrow(/完全一致/);
    expect(getParticipant(db, 'P01')).toBeTruthy(); // 未被误删
  });

  it('正确确认 → 文件、登记行、真名全部清除，他人数据不受影响', () => {
    const scope = purgeSubject(db, paths.originalsRoot, { pseudonym: 'P01', confirmToken: 'P01', actor: 'desktop', ts: 1757462400000 });
    expect(scope).toEqual({ pseudonym: 'P01', encounters: 1, consents: 1, artifacts: 1, memos: 1 });
    expect(existsSync(join(paths.originalsRoot, artifactId))).toBe(false);
    expect(getParticipant(db, 'P01')).toBeNull();
    expect(getRealName(db, 'P01')).toBeNull();
    expect(getEncounter(db, 'enc-1')).toBeNull();
    expect(getArtifact(db, artifactId)).toBeNull();
    expect(listMemos(db).some((m) => m.id === 'memo-1')).toBe(false);
    // 他人数据完好
    expect(getEncounter(db, 'enc-2')).toBeTruthy();
    expect(getParticipant(db, 'P02')).toBeTruthy();
  });

  it('PURGE_SUBJECT 入链且链完整，payloadHash 即 scope 摘要（不含真名）', () => {
    const last = listEvidenceEntries(db).at(-1);
    expect(last?.action).toBe('PURGE_SUBJECT');
    expect(last?.payloadHash).toBe(computePayloadHash({ pseudonym: 'P01', encounters: 1, consents: 1, artifacts: 1, memos: 1 }));
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('artifact id 越界（path traversal）→ 拒绝删除，波及目录与登记行原样（A14）', () => {
    insertArtifact(db, Artifact.parse({ id: '../innocent', encounterId: 'enc-2', type: 'audio', sha256: 'c'.repeat(64), size: 8, mime: 'audio/wav', capturedAt: 1757376400000, deviceId: 'desktop' }), '/nowhere');
    mkdirSync(join(home, 'innocent'), { recursive: true });
    writeFileSync(join(home, 'innocent', 'keep.txt'), 'keep');
    expect(() => purgeSubject(db, paths.originalsRoot, { pseudonym: 'P02', confirmToken: 'P02', actor: 'desktop', ts: 1757462500000 })).toThrow(/越界/);
    expect(existsSync(join(home, 'innocent', 'keep.txt'))).toBe(true);
    expect(getEncounter(db, 'enc-2')).toBeTruthy(); // 事务未执行，登记行未删
  });
});
