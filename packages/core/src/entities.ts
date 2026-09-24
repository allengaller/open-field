import { z } from 'zod';

// ---------- 枚举 ----------
export const ArtifactType = z.enum(['audio', 'photo', 'note', 'doc', 'transcript']);
export type ArtifactType = z.infer<typeof ArtifactType>;

export const MemoType = z.enum(['reflexive', 'analytical', 'daily', 'quicknote']);
export type MemoType = z.infer<typeof MemoType>;

export const ConsentTemplateType = z.enum(['recording', 'portrait', 'publication']);
export type ConsentTemplateType = z.infer<typeof ConsentTemplateType>;

export const InboxStatus = z.enum(['pending', 'ingested', 'quarantined', 'rejected']);
export type InboxStatus = z.infer<typeof InboxStatus>;

export const EvidenceAction = z.enum([
  'INGEST_ARTIFACT',
  'CREATE_EVENT',
  'CREATE_ENCOUNTER',
  'CONSENT_RECORDED',
  'CONSENT_WITHDRAW',
  'MEMO_CONFIRM',
  'MEMO_CODE',
  'CREATE_PARTICIPANT',
  'CREATE_MEMO',
  'EXPORT',
  'TIME_SYNC',
  'PURGE_SUBJECT',
]);
export type EvidenceAction = z.infer<typeof EvidenceAction>;

// ---------- 公共 ----------
export const Gps = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Gps = z.infer<typeof Gps>;

export const CityCode = z.string().regex(/^[A-Z]{3}$/);
export type CityCode = z.infer<typeof CityCode>;

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const IsoDate = z.iso.date();
// 上界 MAX_SAFE_INTEGER：≥2^53 的整数 JSON 往返丢精度，证据哈希必须跨序列化逐字节稳定。
export const EpochMs = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// 链安全字符串：不含 '|'、'\r'、'\n'。'|' 是 entryHash 前像的字段分隔符，
// 含 '|' 的值会让管道拼接编码产生歧义（payloadHash 64-hex、action 枚举同样依赖此前提）。
export const ChainSafeString = z.string().regex(/^[^|\r\n]*$/);
export type ChainSafeString = z.infer<typeof ChainSafeString>;
// 链 actor：非空、≤128 字符，且必须链安全（见 ChainSafeString）。
export const Actor = ChainSafeString.min(1).max(128);
export const Id = z.string().min(1);

// ---------- README 六实体 ----------
export const FieldEvent = z.object({
  id: Id,
  date: IsoDate,
  cityCode: CityCode,
  locationName: z.string().min(1),
  gps: Gps.optional(),
  contextNote: z.string().optional(),
});
export type FieldEvent = z.infer<typeof FieldEvent>;

export const Encounter = z.object({
  id: Id,
  eventId: Id,
  participantRef: z.string().min(1),
  samplingReason: z.string().min(1),
  consentRecordId: Id.optional(),
  startedAt: EpochMs,
  note: z.string().optional(),
});
export type Encounter = z.infer<typeof Encounter>;

export const Artifact = z.object({
  id: Id,
  encounterId: Id.optional(),
  eventId: Id.optional(),
  type: ArtifactType,
  sha256: Sha256,
  size: z.number().int().nonnegative(),
  mime: z.string().min(1),
  capturedAt: EpochMs,
  gps: Gps.optional(),
  deviceId: z.string().min(1),
  version: z.number().int().positive().default(1),
  refId: z.string().min(1).optional(),
});
export type Artifact = z.infer<typeof Artifact>;

// strict：真名只允许存在于桌面端 vault 的 participant_identity 表，
// core 类型层面直接拒绝 real_name 字段（隐私边界在类型上强制）。
export const Participant = z.strictObject({
  pseudonym: z.string().min(1),
  industry: z.string().optional(),
  region: z.string().optional(),
  referralChain: z.array(z.string()).optional(),
  consentScope: z.array(ConsentTemplateType).optional(),
});
export type Participant = z.infer<typeof Participant>;

export const Memo = z.object({
  id: Id,
  linkedArtifactIds: z.array(Id),
  type: MemoType,
  themes: z.array(z.string().min(1)).default([]),
  content: z.string().min(1),
  createdAt: EpochMs,
  confirmedAt: EpochMs.nullable().default(null),
});
export type Memo = z.infer<typeof Memo>;

// ---------- P1 新增实体 ----------
export const ConsentRecord = z.object({
  id: Id,
  encounterId: Id,
  templateType: ConsentTemplateType,
  signatureArtifactId: Id.optional(),
  verbalConsentArtifactId: Id.optional(),
  scope: z.string().min(1),
  withdrawnAt: EpochMs.nullable().default(null),
});
export type ConsentRecord = z.infer<typeof ConsentRecord>;

export const InboxItem = z.object({
  id: Id,
  sourcePath: z.string().min(1),
  detectedAt: EpochMs,
  sha256: Sha256.optional(),
  suggestedEventId: Id.optional(),
  suggestedEncounterId: Id.optional(),
  status: InboxStatus,
});
export type InboxItem = z.infer<typeof InboxItem>;

export const TimeSyncRecord = z.object({
  id: Id,
  checkedAt: EpochMs,
  ntpServer: z.string().min(1),
  offsetMs: z.number().int(),
});
export type TimeSyncRecord = z.infer<typeof TimeSyncRecord>;

export const EvidenceEntry = z.object({
  seq: z.number().int().nonnegative(),
  ts: EpochMs,
  actor: Actor,
  action: EvidenceAction,
  payloadHash: Sha256,
  prevHash: Sha256,
  entryHash: Sha256,
});
export type EvidenceEntry = z.infer<typeof EvidenceEntry>;
