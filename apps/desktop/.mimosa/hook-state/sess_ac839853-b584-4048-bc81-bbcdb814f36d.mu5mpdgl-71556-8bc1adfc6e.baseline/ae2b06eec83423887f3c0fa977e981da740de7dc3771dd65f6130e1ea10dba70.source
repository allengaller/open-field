import { z } from 'zod';
import { Encounter, FieldEvent, Participant } from '@openfield/core';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IpcChannel, IpcResult } from '../shared/ipc';
import type { AppState } from './state';
import { createEventWithEntry, createEncounterWithEntry, confirmMemoWithEntry, buildDailyJournal, withdrawConsentWithEntry } from './services/registry';
import { confirmInboxItem, rejectInboxItem } from './services/ingest';
import { scanOnce } from './services/inbox';
import {
  listInboxItems, listArtifacts, listArtifactsByEncounter, listEncountersByEvent, listFieldEvents,
  upsertParticipant, insertConsentRecord, getEncounter, setRealName,
} from './services/repos';
import { listEvidenceEntries, appendEntry, syncTime } from './services/evidence';
import { computePayloadHash } from '@openfield/core';
import { runVerify } from './services/verify';
import { purgeSubject } from './services/purge';
import { exportBackup, makeCitation } from './services/export';
import { clearMockData, loadMockData, mockFootprint } from './services/mock';
import { getParticipant, listConsentsByEncounter, listMemos } from './services/repos';

const PassphraseInput = z.object({ passphrase: z.string() });
const ConfirmInput = z.object({
  itemId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
});
const PurgeInput = z.object({ pseudonym: z.string().min(1), confirmToken: z.string() });
const BackupInput = z.object({ passphrase: z.string().min(8) });
const ListInput = z.object({ status: z.enum(['pending', 'ingested', 'quarantined', 'rejected']).optional() });
const ItemInput = z.object({ itemId: z.string().min(1) });
const CitationInput = z.object({ artifactId: z.string().min(1) });
const EncountersQuery = z.object({ eventId: z.string().min(1) });
const ArtifactsQuery = z.object({ encounterId: z.string().min(1).optional() });
const DetailQuery = z.object({ encounterId: z.string().min(1) });
const MemoIdInput = z.object({ memoId: z.string().min(1) });
const JournalDateInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const ConsentInput = z.object({
  encounterId: z.string().min(1),
  templateType: z.enum(['recording', 'portrait', 'publication']),
  scope: z.string().min(1),
});
const ConsentIdInput = z.object({ consentId: z.string().min(1) });
const RealNameInput = z.object({ pseudonym: z.string().min(1), realName: z.string().min(1) });

export function createIpcHandlers(
  state: AppState,
): Record<IpcChannel, (payload: unknown) => Promise<IpcResult<unknown>>> {
  async function wrap(fn: () => unknown): Promise<IpcResult<unknown>> {
    try {
      return { ok: true, data: await fn() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    'vault:create': (p) =>
      wrap(() => {
        state.createVault(PassphraseInput.parse(p).passphrase);
        return state.status();
      }),
    'vault:open': (p) =>
      wrap(() => {
        state.openVault(PassphraseInput.parse(p).passphrase);
        return state.status();
      }),
    'vault:status': () => wrap(() => state.status()),
    'events:create': (p) => wrap(() => createEventWithEntry(state.getDb(), FieldEvent.parse(p))),
    'encounters:create': (p) => wrap(() => createEncounterWithEntry(state.getDb(), Encounter.parse(p))),
    'inbox:scan': () =>
      wrap(() => scanOnce(state.getDb(), { inboxDir: state.paths.inboxDir, quarantineDir: state.paths.quarantineDir })),
    'inbox:list': (p) =>
      wrap(() => listInboxItems(state.getDb(), ListInput.parse(p).status)),
    'inbox:confirm': (p) =>
      wrap(async () => {
        const input = ConfirmInput.parse(p);
        return confirmInboxItem(state.getDb(), state.paths.originalsRoot, input.itemId, {
          deviceId: state.deviceId,
          ...(input.encounterId !== undefined ? { encounterId: input.encounterId } : {}),
          ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        });
      }),
    'inbox:reject': (p) => wrap(() => rejectInboxItem(state.getDb(), ItemInput.parse(p).itemId)),
    'verify:run': () => wrap(() => runVerify(state.getDb(), state.paths.originalsRoot)),
    'citation:make': (p) =>
      wrap(() => makeCitation(state.getDb(), { artifactId: CitationInput.parse(p).artifactId, actor: state.deviceId })),
    'purge:subject': (p) =>
      wrap(() => {
        const input = PurgeInput.parse(p);
        return purgeSubject(state.getDb(), state.paths.originalsRoot, {
          pseudonym: input.pseudonym,
          confirmToken: input.confirmToken,
          actor: state.deviceId,
        });
      }),
    'backup:export': (p) =>
      wrap(() => {
        const { passphrase } = BackupInput.parse(p);
        const stamp = new Date().toISOString().replaceAll(':', '-');
        const outPath = join(state.paths.backupsDir, `backup-${stamp}.ofbackup`);
        exportBackup(state.getDb(), state.paths, passphrase, outPath);
        return { outPath };
      }),
    'archive:events': () => wrap(() => listFieldEvents(state.getDb())),
    'archive:encounters': (p) =>
      wrap(() => listEncountersByEvent(state.getDb(), EncountersQuery.parse(p).eventId)),
    'archive:artifacts': (p) =>
      wrap(() => {
        const { encounterId } = ArtifactsQuery.parse(p);
        const db = state.getDb();
        return encounterId ? listArtifactsByEncounter(db, encounterId) : listArtifacts(db);
      }),
    'archive:detail': (p) =>
      wrap(() => {
        const { encounterId } = DetailQuery.parse(p);
        const db = state.getDb();
        const enc = db.prepare('SELECT participant_ref FROM encounters WHERE id = ?').get(encounterId) as { participant_ref: string } | undefined;
        return {
          participant: enc ? getParticipant(db, enc.participant_ref) : null,
          consents: listConsentsByEncounter(db, encounterId),
          memos: listMemos(db),
        };
      }),
    'mock:load': () => wrap(() => loadMockData(state.getDb(), state.paths, state.deviceId)),
    'mock:clear': () => wrap(() => clearMockData(state.getDb(), state.paths)),
    'mock:status': () => wrap(() => mockFootprint(state.getDb())),
    'evidence:list': () => wrap(() => listEvidenceEntries(state.getDb())),
    'memos:confirm': (p) =>
      wrap(() => confirmMemoWithEntry(state.getDb(), MemoIdInput.parse(p).memoId)),
    'journals:build': (p) =>
      wrap(() => buildDailyJournal(state.getDb(), JournalDateInput.parse(p).date)),
    'participants:upsert': (p) =>
      wrap(() => {
        const participant = Participant.parse(p);
        const db = state.getDb();
        const tx = db.transaction(() => {
          upsertParticipant(db, participant);
          appendEntry(db, { ts: Date.now(), actor: 'desktop', action: 'CREATE_PARTICIPANT', payloadHash: computePayloadHash(participant) });
        });
        tx();
        return participant;
      }),
    'consents:record': (p) =>
      wrap(() => {
        const input = ConsentInput.parse(p);
        const db = state.getDb();
        if (!getEncounter(db, input.encounterId)) throw new Error(`encounter 不存在：${input.encounterId}`);
        const consent = {
          id: `consent-${randomUUID()}`,
          encounterId: input.encounterId,
          templateType: input.templateType,
          scope: input.scope,
          withdrawnAt: null,
        };
        const tx = db.transaction(() => {
          insertConsentRecord(db, consent);
          appendEntry(db, { ts: Date.now(), actor: 'desktop', action: 'CONSENT_RECORDED', payloadHash: computePayloadHash(consent) });
        });
        tx();
        return consent;
      }),
    'consents:withdraw': (p) =>
      wrap(() => withdrawConsentWithEntry(state.getDb(), ConsentIdInput.parse(p).consentId)),
    // 真名映射：写加密库内独立表，不入证据链——真名的确定性哈希可被字典攻击，
    // 链载荷只允许出现化名与计数（PRINCIPLES §2.4 / THREAT_MODEL §3）。
    'participants:set-real-name': (p) =>
      wrap(() => {
        const { pseudonym, realName } = RealNameInput.parse(p);
        const db = state.getDb();
        if (!getParticipant(db, pseudonym)) throw new Error(`受访者未建档：${pseudonym}`);
        setRealName(db, pseudonym, realName, Date.now());
        return { pseudonym };
      }),
    'time:sync': () =>
      wrap(async () => {
        try {
          return await syncTime(state.getDb());
        } catch {
          throw new Error('时间同步失败：无法访问 NTP 服务器（离线田野属预期；本机时钟仍用于日常操作）');
        }
      }),
  };
}
