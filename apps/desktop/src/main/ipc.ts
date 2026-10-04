import { z } from 'zod';
import { app, dialog, safeStorage } from 'electron';
import { Encounter, FieldEvent, Participant } from '@openfield/core';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IpcChannel, IpcResult } from '../shared/ipc';
import type { AppState } from './state';
import { createEventWithEntry, createEncounterWithEntry, confirmMemoWithEntry, createMemoWithEntry, codeMemoWithEntry, buildDailyJournal, withdrawConsentWithEntry } from './services/registry';
import { loadResearch } from './services/research';
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
import { exportBackup, makeCitation, restoreBackup } from './services/export';
import { clearMockData, loadMockData, mockFootprint } from './services/mock';
import { getParticipant, listConsentsByEncounter, listMemosByEncounter } from './services/repos';
import { getSettings, setAutoLockMinutes, setDeviceAlias } from './services/settings';
import {
  forgetRememberedKey, hasRememberedKey, readRememberedKey, saveRememberedKey,
  type SafeStorageLike,
} from './services/remembered-key';
import { VaultError } from './services/vault';

const PassphraseInput = z.object({ passphrase: z.string(), remember: z.boolean().optional() });
const ConfirmInput = z.object({
  itemId: z.string().min(1),
  encounterId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
});
const PurgeInput = z.object({ pseudonym: z.string().min(1), confirmToken: z.string() });
const BackupInput = z.object({ passphrase: z.string().min(8) });
const RestoreInput = z.object({
  backupPath: z.string().min(1),
  backupPassphrase: z.string().min(8),
  vaultPassphrase: z.string().min(8),
});
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
const MemoCreateInput = z.object({
  type: z.enum(['reflexive', 'analytical', 'quicknote']),
  content: z.string().min(1),
  themes: z.array(z.string().min(1)).optional(),
  linkedArtifactIds: z.array(z.string().min(1)).optional(),
});
const MemoCodeInput = z.object({ memoId: z.string().min(1), themes: z.array(z.string().min(1)) });
const SettingsSetInput = z.object({
  deviceAlias: z.string().max(128).optional(),
  autoLockMinutes: z.number().int().optional(),
});

// A32：演示数据写入门禁 —— 打包版（app.isPackaged）拒绝 mock:load/mock:clear，
// 防止真实田野资料库混入演示行；mock:status 只读不受限。Node 单测环境 electron
// 命名导出为 undefined，app?.isPackaged 求值为 false，源码/开发运行不受影响。
export function assertDevOnlyMockWrite(isPackaged: boolean): void {
  if (isPackaged) {
    throw new Error('演示数据仅限开发环境：打包版禁止写入演示数据（保持真实资料库纯净）');
  }
}

// A36 记住口令上下文：需要 electron 运行时（userData 目录 + safeStorage 可用）。
// Node 单测环境 app/safeStorage 为 undefined → 返回 null，相关通道按「不可用」处理。
function rememberedCtx(state: AppState): { dir: string; storage: SafeStorageLike; home: string } | null {
  if (!app || !safeStorage?.isEncryptionAvailable()) return null;
  return { dir: app.getPath('userData'), storage: safeStorage, home: state.home };
}

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
        const input = PassphraseInput.parse(p);
        // 先校验 remember 可行性再动状态：库里建到一半再报「无法记住口令」属部分成功
        const ctx = input.remember ? rememberedCtx(state) : null;
        if (input.remember && ctx === null) {
          throw new Error('本机安全存储不可用，无法记住口令（可取消勾选后重试）');
        }
        state.createVault(input.passphrase);
        if (ctx) saveRememberedKey(ctx.dir, ctx.home, input.passphrase, ctx.storage);
        return state.status();
      }),
    'vault:open': (p) =>
      wrap(() => {
        const input = PassphraseInput.parse(p);
        const ctx = input.remember ? rememberedCtx(state) : null;
        if (input.remember && ctx === null) {
          throw new Error('本机安全存储不可用，无法记住口令（可取消勾选后重试）');
        }
        state.openVault(input.passphrase);
        if (ctx) saveRememberedKey(ctx.dir, ctx.home, input.passphrase, ctx.storage);
        return state.status();
      }),
    'vault:status': () => wrap(() => state.status()),
    'vault:saved-key-status': () =>
      wrap(() => {
        const ctx = rememberedCtx(state);
        return { saved: ctx !== null && hasRememberedKey(ctx.dir, state.home), home: state.home };
      }),
    'vault:unlock-saved': () =>
      wrap(() => {
        const ctx = rememberedCtx(state);
        if (ctx === null) throw new Error('本机安全存储不可用，无法使用记住的口令');
        const passphrase = readRememberedKey(ctx.dir, state.home, ctx.storage);
        if (passphrase === null) throw new Error('没有可用的记住口令（未保存、属于其他库或已失效）');
        try {
          state.openVault(passphrase);
        } catch (err) {
          // 口令与库不符（口令被改/库被替换）：记住文件立即作废，不留死密文
          if (err instanceof VaultError && err.code === 'wrong-key') forgetRememberedKey(ctx.dir, state.home);
          throw err;
        }
        return state.status();
      }),
    'vault:forget-saved': () =>
      wrap(() => {
        const ctx = rememberedCtx(state);
        if (ctx) forgetRememberedKey(ctx.dir, state.home);
        return undefined;
      }),
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
          deviceId: state.actorId,
          ...(input.encounterId !== undefined ? { encounterId: input.encounterId } : {}),
          ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        });
      }),
    'inbox:reject': (p) => wrap(() => rejectInboxItem(state.getDb(), ItemInput.parse(p).itemId)),
    'verify:run': () => wrap(() => runVerify(state.getDb(), state.paths.originalsRoot, { anchorPath: state.paths.chainAnchor })),
    'citation:make': (p) =>
      wrap(() => makeCitation(state.getDb(), { artifactId: CitationInput.parse(p).artifactId, actor: state.actorId })),
    'purge:subject': (p) =>
      wrap(() => {
        const input = PurgeInput.parse(p);
        return purgeSubject(state.getDb(), state.paths.originalsRoot, {
          pseudonym: input.pseudonym,
          confirmToken: input.confirmToken,
          actor: state.actorId,
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
    'backup:pick': () =>
      wrap(async () => {
        const picked = await dialog.showOpenDialog({
          title: '选择 OpenField 备份文件',
          defaultPath: app.getPath('downloads'),
          filters: [{ name: 'OpenField 备份', extensions: ['ofbackup'] }],
          properties: ['openFile'],
        });
        return { path: picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0] };
      }),
    'backup:restore': (p) =>
      wrap(() => {
        if (state.unlocked) {
          throw new Error('资料库已解锁：恢复会替换整个资料库，请在启动后的锁定界面（未建库/未开库）时操作');
        }
        const input = RestoreInput.parse(p);
        restoreBackup({ ...input, home: state.home });
        return { home: state.home };
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
          memos: listMemosByEncounter(db, encounterId),
        };
      }),
    'mock:load': () =>
      wrap(() => {
        assertDevOnlyMockWrite(app?.isPackaged === true);
        return loadMockData(state.getDb(), state.paths, state.actorId);
      }),
    'mock:clear': () =>
      wrap(() => {
        assertDevOnlyMockWrite(app?.isPackaged === true);
        return clearMockData(state.getDb(), state.paths);
      }),
    'mock:status': () => wrap(() => mockFootprint(state.getDb())),
    'evidence:list': () => wrap(() => listEvidenceEntries(state.getDb())),
    'memos:confirm': (p) =>
      wrap(() => confirmMemoWithEntry(state.getDb(), MemoIdInput.parse(p).memoId)),
    'research:load': () => wrap(() => loadResearch(state.getDb())),
    'research:memo-create': (p) =>
      wrap(() => createMemoWithEntry(state.getDb(), MemoCreateInput.parse(p))),
    'research:memo-code': (p) => {
      const input = MemoCodeInput.parse(p);
      return wrap(() => codeMemoWithEntry(state.getDb(), input.memoId, input.themes));
    },
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
    // A34 应用级设置：设备代号（空串=清除）与自动锁定分钟数。仅在解锁后可写
    // （设置随加密库存储），锁定态调用 getDb 抛错、由 wrap 转为 ok:false。
    'settings:get': () => wrap(() => getSettings(state.getDb())),
    'settings:set': (p) =>
      wrap(() => {
        const input = SettingsSetInput.parse(p);
        const db = state.getDb();
        if (input.deviceAlias !== undefined) setDeviceAlias(db, input.deviceAlias);
        if (input.autoLockMinutes !== undefined) setAutoLockMinutes(db, input.autoLockMinutes);
        return getSettings(db);
      }),
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
