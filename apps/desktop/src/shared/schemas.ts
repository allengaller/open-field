// IPC 响应 schema：每个通道一条，renderer 的 invoke 据此做运行时校验，
// 测试 ipc-schema.test.ts 逐通道实调 handler 把 schema 钉死在真实返回上——
// 服务改了返回形状，钉死测试即红，schema 不可能与实现各自漂移。
// 实体 schema 直接复用 @openfield/core；对象用非严格模式：新增字段向后兼容，
// 删除/改形字段被运行时 parse 与钉死测试双重拦截。
import { z } from 'zod';
// 深导入纯 schema 模块（仅 zod 依赖）：本文件会被 renderer 打包，
// 走 core barrel 会把 node:crypto（canonical/hashchain）拖进浏览器 bundle。
import {
  Artifact, ConsentRecord, Encounter, EvidenceEntry, FieldEvent, InboxItem, Memo, Participant,
} from '@openfield/core/src/entities';
import type { IpcChannel } from './ipc';

const ArtifactRecord = Artifact.extend({ originalPath: z.string() });
// 「业务对象 + 链条目」成对返回，键名随通道不同（event/encounter/memo/consent）
const WithEntry = <T extends z.ZodTypeAny>(key: string, data: T) => z.object({ [key]: data, entry: EvidenceEntry });

export const VaultStatus = z.object({
  home: z.string(),
  hasVault: z.boolean(),
  unlocked: z.boolean(),
  events: z.number(),
  encounters: z.number(),
  pendingInbox: z.number(),
});

export const ScanSummary = z.object({
  pending: z.number(),
  quarantined: z.number(),
  skippedIcloud: z.number(),
  skippedEmpty: z.number(),
  appliedBundles: z.number(),
});

export const MockSummary = z.object({
  events: z.number(),
  participants: z.number(),
  encounters: z.number(),
  artifacts: z.number(),
  consents: z.number(),
  memos: z.number(),
  inboxFiles: z.number(),
  citations: z.number(),
});

export const MockFootprint = z.object({
  events: z.number(),
  encounters: z.number(),
  artifacts: z.number(),
});

const VerifyReport = z.object({
  chainOk: z.boolean(),
  chainBrokenAt: z.number().nullable(),
  chainReason: z.string().nullable(),
  issues: z.array(
    z.object({
      kind: z.enum(['hash-mismatch', 'original-missing', 'orphan-directory', 'unreadable', 'anchor-mismatch', 'anchor-unreadable']),
      message: z.string(),
      artifactId: z.string().optional(),
      path: z.string().optional(),
    }),
  ),
  artifactCount: z.number(),
  checkedAt: z.number(),
});

const PurgeScope = z.object({
  pseudonym: z.string(),
  encounters: z.number(),
  consents: z.number(),
  artifacts: z.number(),
  memos: z.number(),
});

const TimeSyncPayload = z.object({
  record: z.object({ checkedAt: z.number(), ntpServer: z.string(), offsetMs: z.number() }),
  entry: EvidenceEntry,
});

const DetailPayloadSchema = z.object({
  participant: Participant.nullable(),
  consents: z.array(ConsentRecord),
  memos: z.array(Memo),
});

const TimelineRowSchema = z.object({
  kind: z.enum(['event', 'encounter', 'artifact', 'memo']),
  id: z.string(),
  at: z.number(),
  title: z.string(),
  detail: z.string(),
  themes: z.array(z.string()).optional(),
  confirmed: z.boolean().optional(),
  eventId: z.string().optional(),
  encounterId: z.string().optional(),
});

const ResearchPayloadSchema = z.object({
  timeline: z.array(TimelineRowSchema),
  memos: z.array(Memo),
  themeCounts: z.array(z.object({ theme: z.string(), count: z.number() })),
  stats: z.object({ memos: z.number(), drafts: z.number(), confirmed: z.number(), themes: z.number() }),
});

export const IPC_RESPONSE_SCHEMAS: Record<IpcChannel, z.ZodTypeAny> = {  'vault:create': VaultStatus,
  'vault:open': VaultStatus,
  'vault:status': VaultStatus,
  'events:create': WithEntry('event', FieldEvent),
  'encounters:create': WithEntry('encounter', Encounter),
  'inbox:scan': ScanSummary,
  'inbox:list': z.array(InboxItem),
  'inbox:confirm': Artifact,
  'inbox:reject': z.undefined(),
  'verify:run': VerifyReport,
  'citation:make': z.object({ refId: z.string(), artifact: ArtifactRecord }),
  'purge:subject': PurgeScope,
  'backup:export': z.object({ outPath: z.string() }),
  'backup:pick': z.object({ path: z.string().nullable() }),
  'backup:restore': z.object({ home: z.string() }),
  'archive:events': z.array(FieldEvent),
  'archive:encounters': z.array(Encounter),
  'archive:artifacts': z.array(ArtifactRecord),
  'archive:detail': DetailPayloadSchema,
  'evidence:list': z.array(EvidenceEntry),
  'memos:confirm': WithEntry('memo', Memo),
  'research:load': ResearchPayloadSchema,
  'research:memo-create': WithEntry('memo', Memo),
  'research:memo-code': WithEntry('memo', Memo),
  'journals:build': Memo,
  'participants:upsert': Participant,
  'participants:set-real-name': z.object({ pseudonym: z.string() }),
  'consents:record': ConsentRecord,
  'consents:withdraw': WithEntry('consent', ConsentRecord),
  'time:sync': TimeSyncPayload,
  'mock:load': MockSummary,
  'mock:clear': z.undefined(),
  'mock:status': MockFootprint,
};

// UI 载荷类型唯一定义处：shared/types.ts 从这里转发，杜绝「schema 与 interface 各自手抄」。
export type VaultStatus = z.infer<typeof VaultStatus>;
export type ScanSummary = z.infer<typeof ScanSummary>;
export type MockSummary = z.infer<typeof MockSummary>;
export type MockFootprint = z.infer<typeof MockFootprint>;
export type DetailPayload = z.infer<typeof DetailPayloadSchema>;
export type TimeSyncPayload = z.infer<typeof TimeSyncPayload>;
export type ResearchPayload = z.infer<typeof ResearchPayloadSchema>;
export type ResearchTimelineRow = z.infer<typeof TimelineRowSchema>;
