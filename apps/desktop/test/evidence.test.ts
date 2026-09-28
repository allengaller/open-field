import { describe, it, expect, afterAll } from 'vitest';
import { verifyChain } from '@openfield/core';
import { cleanupTestVault, makeTestVault } from './helpers';
import { appendEntry, getLastEntry, listEvidenceEntries, recordTimeSync, syncTime } from '../src/main/services/evidence';
import { listTimeSyncRecords } from '../src/main/services/repos';

const { db, home } = makeTestVault();
afterAll(() => cleanupTestVault(home));

describe('appendEntry', () => {
  it('从 0 开始连续追加，链校验通过', () => {
    const e0 = appendEntry(db, { ts: 1757376000000, actor: 'desktop', action: 'CREATE_EVENT', payloadHash: 'a'.repeat(64) });
    const e1 = appendEntry(db, { ts: 1757376000001, actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: 'b'.repeat(64) });
    expect(e0.seq).toBe(0);
    expect(e0.prevHash).toBe('0'.repeat(64));
    expect(e1.seq).toBe(1);
    expect(e1.prevHash).toBe(e0.entryHash);
    expect(verifyChain(listEvidenceEntries(db))).toEqual({ ok: true });
    expect(getLastEntry(db)?.seq).toBe(1);
  });

  it('直接改库篡改 entry_hash 会被 verifyChain 检出（DROP 触发器模拟越权篡改，A7）', () => {
    const tampered = makeTestVault();
    try {
      appendEntry(tampered.db, { ts: 1757376000000, actor: 'desktop', action: 'CREATE_EVENT', payloadHash: 'a'.repeat(64) });
      appendEntry(tampered.db, { ts: 1757376000001, actor: 'desktop', action: 'INGEST_ARTIFACT', payloadHash: 'b'.repeat(64) });
      tampered.db.exec('DROP TRIGGER evidence_log_no_update; DROP TRIGGER evidence_log_no_delete;');
      tampered.db.prepare('UPDATE evidence_log SET entry_hash = ? WHERE seq = 0').run('f'.repeat(64));
      const result = verifyChain(listEvidenceEntries(tampered.db));
      expect(result.ok).toBe(false);
    } finally {
      tampered.db.close();
      cleanupTestVault(tampered.home);
    }
  });
});

describe('recordTimeSync', () => {
  it('记录 TimeSyncRecord 并以 TIME_SYNC 入链', () => {
    const before = listEvidenceEntries(db).length;
    const { record, entry } = recordTimeSync(db, { ntpServer: 'test.pool', offsetMs: -320, ts: 1757376100000 });
    expect(record.id).toBeTruthy();
    expect(record.offsetMs).toBe(-320);
    expect(entry.action).toBe('TIME_SYNC');
    expect(listEvidenceEntries(db).length).toBe(before + 1);
  });
});

describe('syncTime', () => {
  it('NTP 偏移经注入的 offsetFn 获取后入库入链（服务器名透传）', async () => {
    const before = listEvidenceEntries(db).length;
    const { record, entry } = await syncTime(db, { host: 'pool.example', offsetFn: async () => 1500 });
    expect(record.ntpServer).toBe('pool.example');
    expect(record.offsetMs).toBe(1500);
    expect(entry.action).toBe('TIME_SYNC');
    expect(listEvidenceEntries(db).length).toBe(before + 1);
    expect(listTimeSyncRecords(db).some((r) => r.id === record.id)).toBe(true);
    expect(verifyChain(listEvidenceEntries(db)).ok).toBe(true);
  });

  it('NTP 不可达（offsetFn 返回 null）→ 抛错且不落任何记录（离线田野预期路径）', async () => {
    const entriesBefore = listEvidenceEntries(db).length;
    const recordsBefore = listTimeSyncRecords(db).length;
    await expect(syncTime(db, { offsetFn: async () => null as unknown as number })).rejects.toThrow();
    expect(listEvidenceEntries(db).length).toBe(entriesBefore); // 链不变
    expect(listTimeSyncRecords(db).length).toBe(recordsBefore); // 校时记录不落半条
  });
});
