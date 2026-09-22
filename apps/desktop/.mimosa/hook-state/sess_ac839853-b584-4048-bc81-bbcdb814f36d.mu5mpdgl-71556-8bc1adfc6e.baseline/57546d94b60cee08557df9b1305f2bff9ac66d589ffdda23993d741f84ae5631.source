import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, Participant } from '@openfield/core';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntry } from './evidence';
import { guessArtifactType, ingestFile } from './ingest';
import { scanOnce } from './inbox';
import { makeCitation } from './export';
import { buildDailyJournal, createEncounterWithEntry, createEventWithEntry } from './registry';
import {
  insertConsentRecordIfAbsent, insertMemoIfAbsent, insertParticipantIfAbsent, listArtifacts,
} from './repos';
import {
  mockArtifacts, mockConsents, mockEncounters, mockEvents, mockInboxFiles, mockMemos, mockParticipants,
  type MockArtifact,
} from './mock-data';
import type { VaultPaths } from './vault';

export interface MockSummary {
  events: number;
  participants: number;
  encounters: number;
  artifacts: number;
  consents: number;
  memos: number;
  inboxFiles: number;
  citations: number;
}

function dayOffsetToTs(dayOffset: number, hour = 9): number {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** 清除演示数据。证据链日志为 append-only，链条目保留（只删业务行与文件）。 */
export async function clearMockData(db: Database.Database, paths: VaultPaths): Promise<void> {
  const eventIds = mockEvents.map((e) => e.id);
  const encounterIds = mockEncounters.map((e) => e.id);
  const artifactIds = mockArtifacts.map((a) => a.id);
  const consentIds = mockConsents.map((c) => c.id);
  const memoIds = mockMemos.map((m) => m.id);
  const journalIds = mockEvents.map((e) => `journal-${e.date}`);

  // 待定项按文件名前缀删（id 是随机的），其余按 ID 列表删
  db.prepare("DELETE FROM inbox_items WHERE source_path LIKE '%/demo-inbox-%'").run();
  for (const id of [...journalIds, ...memoIds]) db.prepare('DELETE FROM memos WHERE id = ?').run(id);
  for (const id of consentIds) db.prepare('DELETE FROM consent_records WHERE id = ?').run(id);
  for (const id of artifactIds) {
    const row = db.prepare('SELECT original_path FROM artifacts WHERE id = ?').get(id) as { original_path: string } | undefined;
    if (row) {
      db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
      await rm(join(row.original_path, '..'), { recursive: true, force: true }); // 封存目录 = 文件父目录
    }
  }
  for (const id of encounterIds) db.prepare('DELETE FROM encounters WHERE id = ?').run(id);
  for (const id of eventIds) db.prepare('DELETE FROM field_events WHERE id = ?').run(id);
  for (const p of mockParticipants) db.prepare('DELETE FROM participant_identity WHERE pseudonym = ?').run(p.pseudonym);
  for (const p of mockParticipants) db.prepare('DELETE FROM participants WHERE pseudonym = ?').run(p.pseudonym);

  // inbox 演示文件
  for (const f of mockInboxFiles) await rm(join(paths.inboxDir, f.filename), { force: true });
}

/** 载入演示数据：全部走真实代码路径（ingest 封存 + 哈希链条目），可重复执行（先清后载）。 */
export async function loadMockData(db: Database.Database, paths: VaultPaths, deviceId: string): Promise<MockSummary> {
  await clearMockData(db, paths);

  for (const e of mockEvents) {
    createEventWithEntry(db, {
      id: e.id,
      date: e.date,
      cityCode: e.cityCode,
      locationName: e.locationName,
      ...(e.contextNote !== undefined ? { contextNote: e.contextNote } : {}),
    }, { ts: dayOffsetToTs(e.dayOffset, 8) });
  }

  for (const p of mockParticipants) {
    const participant = Participant.parse({
      pseudonym: p.pseudonym,
      ...(p.industry !== undefined ? { industry: p.industry } : {}),
      ...(p.region !== undefined ? { region: p.region } : {}),
      ...(p.referralChain !== undefined ? { referralChain: p.referralChain } : {}),
      ...(p.consentScope !== undefined ? { consentScope: p.consentScope } : {}),
    });
    const tx = db.transaction(() => {
      if (insertParticipantIfAbsent(db, participant)) {
        appendEntry(db, { ts: dayOffsetToTs(2, 8), actor: 'desktop', action: 'CREATE_PARTICIPANT', payloadHash: computePayloadHash(participant) });
      }
    });
    tx();
  }

  for (const c of mockEncounters) {
    createEncounterWithEntry(db, {
      id: c.id,
      eventId: c.eventId,
      participantRef: c.participantRef,
      samplingReason: c.samplingReason,
      startedAt: dayOffsetToTs(c.dayOffset, 10),
    }, { ts: dayOffsetToTs(c.dayOffset, 10) });
  }

  for (const c of mockConsents) {
    const consent = {
      id: c.id,
      encounterId: c.encounterId,
      templateType: c.templateType,
      scope: c.scope,
      withdrawnAt: c.withdrawn ? dayOffsetToTs(1, 18) : null,
    };
    const tx = db.transaction(() => {
      if (insertConsentRecordIfAbsent(db, consent)) {
        appendEntry(db, { ts: dayOffsetToTs(c.withdrawn ? 1 : 2, 12), actor: 'desktop', action: 'CONSENT_RECORDED', payloadHash: computePayloadHash(consent) });
      }
    });
    tx();
  }

  // 采集物：写临时文件 → 走真实 ingest 封存（哈希、只读、链条目与正式入库完全一致）
  const staging = mkdtempSync(join(tmpdir(), 'of-mock-'));
  try {
    let ingested = 0;
    for (const a of mockArtifacts) {
      await ingestMockArtifact(db, paths.originalsRoot, staging, a, deviceId);
      ingested += 1;
    }

    for (const m of mockMemos) {
      const tx = db.transaction(() => {
        if (insertMemoIfAbsent(db, {
          id: m.id,
          linkedArtifactIds: m.linkedArtifactIds ?? [],
          type: m.type,
          content: m.content,
          createdAt: dayOffsetToTs(1, 21),
          confirmedAt: null,
        })) {
          appendEntry(db, { ts: dayOffsetToTs(1, 21), actor: 'desktop', action: 'CREATE_MEMO', payloadHash: computePayloadHash({ id: m.id }) });
        }
      });
      tx();
    }

    // 每个事件日期生成一份真实的田野日志草稿
    for (const e of mockEvents) buildDailyJournal(db, e.date, { now: dayOffsetToTs(1, 22) });

    // 为勾选 makeCitation 的采集物生成学术引用
    let citations = 0;
    for (const a of mockArtifacts) {
      if (!a.makeCitation) continue;
      await makeCitation(db, { artifactId: a.id, actor: deviceId });
      citations += 1;
    }

    // 收件箱演示文件（watcher 会自动扫到；这里主动扫一遍保证立即可见）
    await mkdir(paths.inboxDir, { recursive: true });
    for (const f of mockInboxFiles) {
      await writeFile(join(paths.inboxDir, f.filename), f.content, 'utf8');
    }
    await scanOnce(db, { inboxDir: paths.inboxDir, quarantineDir: paths.quarantineDir });

    return {
      events: mockEvents.length,
      participants: mockParticipants.length,
      encounters: mockEncounters.length,
      artifacts: ingested,
      consents: mockConsents.length,
      memos: mockMemos.length + mockEvents.length,
      inboxFiles: mockInboxFiles.length,
      citations,
    };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function ingestMockArtifact(
  db: Database.Database,
  originalsRoot: string,
  staging: string,
  a: MockArtifact,
  deviceId: string,
): Promise<void> {
  const sourcePath = join(staging, `${a.id}.${a.filename.split('.').pop()}`);
  await writeFile(sourcePath, a.content, 'utf8');
  const { type, mime } = guessArtifactType(a.filename);
  await ingestFile(db, originalsRoot, {
    sourcePath,
    mime,
    type,
    deviceId,
    artifactId: a.id,
    capturedAt: dayOffsetToTs(a.dayOffset, 11),
    ...(a.encounterId !== undefined ? { encounterId: a.encounterId } : {}),
    ...(a.eventId !== undefined ? { eventId: a.eventId } : {}),
  });
}

/** 概览面板用：当前演示数据规模（0 = 未载入） */
export function mockFootprint(db: Database.Database): { artifacts: number; events: number; encounters: number } {
  const count = (sql: string, ...ids: string[]): number => {
    let n = 0;
    for (const id of ids) {
      if (db.prepare(sql).get(id)) n += 1;
    }
    return n;
  };
  return {
    events: count('SELECT 1 FROM field_events WHERE id = ?', ...mockEvents.map((e) => e.id)),
    encounters: count('SELECT 1 FROM encounters WHERE id = ?', ...mockEncounters.map((e) => e.id)),
    artifacts: listArtifacts(db).filter((a) => a.id.startsWith('art-demo-')).length,
  };
}
