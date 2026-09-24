import type Database from 'better-sqlite3-multiple-ciphers';
import {
  Artifact, ConsentRecord, Encounter, FieldEvent, InboxItem, Memo, Participant, TimeSyncRecord,
  type ArtifactType, type InboxStatus,
} from '@openfield/core';

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v as string;
}
function num(v: unknown): number {
  return v as number;
}

function rowToEvent(r: Row): FieldEvent {
  return FieldEvent.parse({
    id: str(r.id),
    date: str(r.date),
    cityCode: str(r.city_code),
    locationName: str(r.location_name),
    ...(r.gps_lat !== null && r.gps_lat !== undefined ? { gps: { lat: num(r.gps_lat), lng: num(r.gps_lng) } } : {}),
    ...(r.context_note !== null && r.context_note !== undefined ? { contextNote: str(r.context_note) } : {}),
  });
}

function rowToEncounter(r: Row): Encounter {
  return Encounter.parse({
    id: str(r.id),
    eventId: str(r.event_id),
    participantRef: str(r.participant_ref),
    samplingReason: str(r.sampling_reason),
    ...(r.consent_record_id !== null && r.consent_record_id !== undefined ? { consentRecordId: str(r.consent_record_id) } : {}),
    startedAt: num(r.started_at),
    ...(r.note !== null && r.note !== undefined ? { note: str(r.note) } : {}),
  });
}

export type ArtifactRecord = Artifact & { originalPath: string };

function rowToArtifact(r: Row): ArtifactRecord {
  const artifact = Artifact.parse({
    id: str(r.id),
    ...(r.encounter_id !== null && r.encounter_id !== undefined ? { encounterId: str(r.encounter_id) } : {}),
    ...(r.event_id !== null && r.event_id !== undefined ? { eventId: str(r.event_id) } : {}),
    type: str(r.type) as ArtifactType,
    sha256: str(r.sha256),
    size: num(r.size),
    mime: str(r.mime),
    capturedAt: num(r.captured_at),
    ...(r.gps_lat !== null && r.gps_lat !== undefined ? { gps: { lat: num(r.gps_lat), lng: num(r.gps_lng) } } : {}),
    deviceId: str(r.device_id),
    version: num(r.version),
    ...(r.ref_id !== null && r.ref_id !== undefined ? { refId: str(r.ref_id) } : {}),
  });
  return { ...artifact, originalPath: str(r.original_path) };
}

function rowToParticipant(r: Row): Participant {
  return Participant.parse({
    pseudonym: str(r.pseudonym),
    ...(r.industry !== null && r.industry !== undefined ? { industry: str(r.industry) } : {}),
    ...(r.region !== null && r.region !== undefined ? { region: str(r.region) } : {}),
    ...(r.referral_chain !== null && r.referral_chain !== undefined ? { referralChain: JSON.parse(str(r.referral_chain)) as string[] } : {}),
    ...(r.consent_scope !== null && r.consent_scope !== undefined ? { consentScope: JSON.parse(str(r.consent_scope)) as ('recording' | 'portrait' | 'publication')[] } : {}),
  });
}

function rowToConsent(r: Row): ConsentRecord {
  return ConsentRecord.parse({
    id: str(r.id),
    encounterId: str(r.encounter_id),
    templateType: str(r.template_type) as 'recording' | 'portrait' | 'publication',
    ...(r.signature_artifact_id !== null && r.signature_artifact_id !== undefined ? { signatureArtifactId: str(r.signature_artifact_id) } : {}),
    ...(r.verbal_consent_artifact_id !== null && r.verbal_consent_artifact_id !== undefined ? { verbalConsentArtifactId: str(r.verbal_consent_artifact_id) } : {}),
    scope: str(r.scope),
    withdrawnAt: r.withdrawn_at === null || r.withdrawn_at === undefined ? null : num(r.withdrawn_at),
  });
}

function rowToMemo(r: Row): Memo {
  return Memo.parse({
    id: str(r.id),
    linkedArtifactIds: JSON.parse(str(r.linked_artifact_ids)) as string[],
    type: str(r.type) as 'reflexive' | 'analytical' | 'daily' | 'quicknote',
    themes: JSON.parse(str(r.themes) || '[]') as string[],
    content: str(r.content),
    createdAt: num(r.created_at),
    confirmedAt: r.confirmed_at === null || r.confirmed_at === undefined ? null : num(r.confirmed_at),
  });
}

function rowToInboxItem(r: Row): InboxItem {
  return InboxItem.parse({
    id: str(r.id),
    sourcePath: str(r.source_path),
    detectedAt: num(r.detected_at),
    ...(r.sha256 !== null && r.sha256 !== undefined ? { sha256: str(r.sha256) } : {}),
    ...(r.suggested_event_id !== null && r.suggested_event_id !== undefined ? { suggestedEventId: str(r.suggested_event_id) } : {}),
    ...(r.suggested_encounter_id !== null && r.suggested_encounter_id !== undefined ? { suggestedEncounterId: str(r.suggested_encounter_id) } : {}),
    status: str(r.status) as InboxStatus,
  });
}

// ---------- FieldEvent ----------

export function insertFieldEvent(db: Database.Database, e: FieldEvent): void {
  const v = FieldEvent.parse(e);
  db.prepare(
    'INSERT INTO field_events (id, date, city_code, location_name, gps_lat, gps_lng, context_note) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(v.id, v.date, v.cityCode, v.locationName, v.gps?.lat ?? null, v.gps?.lng ?? null, v.contextNote ?? null);
}

export function getFieldEvent(db: Database.Database, id: string): FieldEvent | null {
  const r = db.prepare('SELECT * FROM field_events WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToEvent(r) : null;
}

export function listFieldEvents(db: Database.Database, date?: string): FieldEvent[] {
  const rows = date
    ? (db.prepare('SELECT * FROM field_events WHERE date = ? ORDER BY id').all(date) as Row[])
    : (db.prepare('SELECT * FROM field_events ORDER BY id').all() as Row[]);
  return rows.map(rowToEvent);
}

// ---------- Encounter ----------

export function insertEncounter(db: Database.Database, e: Encounter): void {
  const v = Encounter.parse(e);
  db.prepare(
    'INSERT INTO encounters (id, event_id, participant_ref, sampling_reason, consent_record_id, started_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(v.id, v.eventId, v.participantRef, v.samplingReason, v.consentRecordId ?? null, v.startedAt, v.note ?? null);
}

export function getEncounter(db: Database.Database, id: string): Encounter | null {
  const r = db.prepare('SELECT * FROM encounters WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToEncounter(r) : null;
}

export function listEncountersByEvent(db: Database.Database, eventId: string): Encounter[] {
  return (db.prepare('SELECT * FROM encounters WHERE event_id = ? ORDER BY started_at').all(eventId) as Row[]).map(rowToEncounter);
}

// ---------- Artifact ----------

export function insertArtifact(db: Database.Database, a: Artifact, originalPath: string): void {
  const v = Artifact.parse(a);
  db.prepare(
    'INSERT INTO artifacts (id, encounter_id, event_id, type, sha256, size, mime, captured_at, gps_lat, gps_lng, device_id, version, ref_id, original_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    v.id, v.encounterId ?? null, v.eventId ?? null, v.type, v.sha256, v.size, v.mime, v.capturedAt,
    v.gps?.lat ?? null, v.gps?.lng ?? null, v.deviceId, v.version, v.refId ?? null, originalPath,
  );
}

export function getArtifact(db: Database.Database, id: string): ArtifactRecord | null {
  const r = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToArtifact(r) : null;
}

export function getArtifactBySha256(db: Database.Database, sha256: string): ArtifactRecord | null {
  const r = db.prepare('SELECT * FROM artifacts WHERE sha256 = ?').get(sha256) as Row | undefined;
  return r ? rowToArtifact(r) : null;
}

export function listArtifacts(db: Database.Database): ArtifactRecord[] {
  return (db.prepare('SELECT * FROM artifacts ORDER BY captured_at').all() as Row[]).map(rowToArtifact);
}

export function listArtifactsByEncounter(db: Database.Database, encounterId: string): ArtifactRecord[] {
  return (db.prepare('SELECT * FROM artifacts WHERE encounter_id = ? ORDER BY captured_at').all(encounterId) as Row[]).map(rowToArtifact);
}

export function setArtifactRefId(db: Database.Database, id: string, refId: string): void {
  db.prepare('UPDATE artifacts SET ref_id = ? WHERE id = ?').run(refId, id);
}

// ---------- Participant（分析层）+ participant_identity（真名，隔离） ----------

export function upsertParticipant(db: Database.Database, p: Participant): void {
  const v = Participant.parse(p);
  db.prepare(
    `INSERT INTO participants (pseudonym, industry, region, referral_chain, consent_scope) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pseudonym) DO UPDATE SET industry=excluded.industry, region=excluded.region, referral_chain=excluded.referral_chain, consent_scope=excluded.consent_scope`,
  ).run(
    v.pseudonym, v.industry ?? null, v.region ?? null,
    v.referralChain ? JSON.stringify(v.referralChain) : null,
    v.consentScope ? JSON.stringify(v.consentScope) : null,
  );
}

export function getParticipant(db: Database.Database, pseudonym: string): Participant | null {
  const r = db.prepare('SELECT * FROM participants WHERE pseudonym = ?').get(pseudonym) as Row | undefined;
  return r ? rowToParticipant(r) : null;
}

export function listParticipants(db: Database.Database): Participant[] {
  return (db.prepare('SELECT * FROM participants ORDER BY pseudonym').all() as Row[]).map(rowToParticipant);
}

// 以下两函数是整个代码库里唯一允许接触 participant_identity 表的入口。

export function setRealName(db: Database.Database, pseudonym: string, realName: string, createdAt: number): void {
  db.prepare(
    `INSERT INTO participant_identity (pseudonym, real_name, created_at) VALUES (?, ?, ?)
     ON CONFLICT(pseudonym) DO UPDATE SET real_name=excluded.real_name`,
  ).run(pseudonym, realName, createdAt);
}

export function getRealName(db: Database.Database, pseudonym: string): string | null {
  const r = db.prepare('SELECT real_name FROM participant_identity WHERE pseudonym = ?').get(pseudonym) as { real_name: string } | undefined;
  return r ? r.real_name : null;
}

// ---------- ConsentRecord ----------

export function insertConsentRecord(db: Database.Database, c: ConsentRecord): void {
  const v = ConsentRecord.parse(c);
  db.prepare(
    'INSERT INTO consent_records (id, encounter_id, template_type, signature_artifact_id, verbal_consent_artifact_id, scope, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(v.id, v.encounterId, v.templateType, v.signatureArtifactId ?? null, v.verbalConsentArtifactId ?? null, v.scope, v.withdrawnAt ?? null);
}

export function getConsentRecord(db: Database.Database, id: string): ConsentRecord | null {
  const r = db.prepare('SELECT * FROM consent_records WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToConsent(r) : null;
}

export function listConsentsByEncounter(db: Database.Database, encounterId: string): ConsentRecord[] {
  return (db.prepare('SELECT * FROM consent_records WHERE encounter_id = ? ORDER BY id').all(encounterId) as Row[]).map(rowToConsent);
}

export function withdrawConsent(db: Database.Database, id: string, at: number): void {
  db.prepare('UPDATE consent_records SET withdrawn_at = ? WHERE id = ?').run(at, id);
}

// ---------- Memo ----------

export function insertMemo(db: Database.Database, m: Memo): void {
  const v = Memo.parse(m);
  db.prepare(
    'INSERT INTO memos (id, linked_artifact_ids, type, themes, content, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(v.id, JSON.stringify(v.linkedArtifactIds), v.type, JSON.stringify(v.themes ?? []), v.content, v.createdAt, v.confirmedAt ?? null);
}

export function getMemo(db: Database.Database, id: string): Memo | null {
  const r = db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToMemo(r) : null;
}

export function listMemos(db: Database.Database): Memo[] {
  return (db.prepare('SELECT * FROM memos ORDER BY created_at').all() as Row[]).map(rowToMemo);
}

// 访谈详情页的备忘录：只取关联到该访谈采集物的，而非全馆列表（A25）
export function listMemosByEncounter(db: Database.Database, encounterId: string): Memo[] {
  const artifactIds = new Set(listArtifactsByEncounter(db, encounterId).map((a) => a.id));
  if (artifactIds.size === 0) return [];
  return listMemos(db).filter((m) => m.linkedArtifactIds.some((id) => artifactIds.has(id)));
}

export function confirmMemo(db: Database.Database, id: string, confirmedAt: number): Memo {
  db.prepare('UPDATE memos SET confirmed_at = ? WHERE id = ?').run(confirmedAt, id);
  const memo = getMemo(db, id);
  if (!memo) throw new Error(`memo 不存在：${id}`);
  return memo;
}

export function updateMemoThemes(db: Database.Database, id: string, themes: string[]): Memo {
  db.prepare('UPDATE memos SET themes = ? WHERE id = ?').run(JSON.stringify(themes), id);
  const memo = getMemo(db, id);
  if (!memo) throw new Error(`memo 不存在：${id}`);
  return memo;
}

// ---------- InboxItem ----------

export function insertInboxItem(db: Database.Database, i: InboxItem): void {
  const v = InboxItem.parse(i);
  db.prepare(
    'INSERT INTO inbox_items (id, source_path, detected_at, sha256, suggested_event_id, suggested_encounter_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(v.id, v.sourcePath, v.detectedAt, v.sha256 ?? null, v.suggestedEventId ?? null, v.suggestedEncounterId ?? null, v.status);
}

export function getInboxItem(db: Database.Database, id: string): InboxItem | null {
  const r = db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToInboxItem(r) : null;
}

export function getInboxItemBySourcePath(db: Database.Database, sourcePath: string, status: InboxStatus): InboxItem | null {
  const r = db.prepare('SELECT * FROM inbox_items WHERE source_path = ? AND status = ?').get(sourcePath, status) as Row | undefined;
  return r ? rowToInboxItem(r) : null;
}

export function listInboxItems(db: Database.Database, status?: InboxStatus): InboxItem[] {
  const rows = status
    ? (db.prepare('SELECT * FROM inbox_items WHERE status = ? ORDER BY detected_at').all(status) as Row[])
    : (db.prepare('SELECT * FROM inbox_items ORDER BY detected_at').all() as Row[]);
  return rows.map(rowToInboxItem);
}

export function updateInboxItem(
  db: Database.Database,
  id: string,
  patch: { status?: InboxStatus; sha256?: string; suggestedEventId?: string; suggestedEncounterId?: string },
): void {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status); }
  if (patch.sha256 !== undefined) { sets.push('sha256 = ?'); vals.push(patch.sha256); }
  if (patch.suggestedEventId !== undefined) { sets.push('suggested_event_id = ?'); vals.push(patch.suggestedEventId); }
  if (patch.suggestedEncounterId !== undefined) { sets.push('suggested_encounter_id = ?'); vals.push(patch.suggestedEncounterId); }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE inbox_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

// ---------- TimeSyncRecord ----------

export function insertTimeSyncRecord(db: Database.Database, r: TimeSyncRecord): void {
  const v = TimeSyncRecord.parse(r);
  db.prepare('INSERT INTO time_sync_records (id, checked_at, ntp_server, offset_ms) VALUES (?, ?, ?, ?)').run(v.id, v.checkedAt, v.ntpServer, v.offsetMs);
}

// ---------- IfAbsent（bundle 应用等幂等场景用：返回是否新插入） ----------

// table 只能由本文件内的字面量调用方传入，不得来自外部输入（防注入约定）
function existsWithId(db: Database.Database, table: string, id: string): boolean {
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
}

export function insertFieldEventIfAbsent(db: Database.Database, e: FieldEvent): boolean {
  const v = FieldEvent.parse(e);
  if (existsWithId(db, 'field_events', v.id)) return false;
  insertFieldEvent(db, v);
  return true;
}

export function insertEncounterIfAbsent(db: Database.Database, e: Encounter): boolean {
  const v = Encounter.parse(e);
  if (existsWithId(db, 'encounters', v.id)) return false;
  insertEncounter(db, v);
  return true;
}

export function insertParticipantIfAbsent(db: Database.Database, p: Participant): boolean {
  const v = Participant.parse(p);
  if (db.prepare('SELECT 1 FROM participants WHERE pseudonym = ?').get(v.pseudonym)) return false;
  upsertParticipant(db, v);
  return true;
}

export function insertConsentRecordIfAbsent(db: Database.Database, c: ConsentRecord): boolean {
  const v = ConsentRecord.parse(c);
  if (existsWithId(db, 'consent_records', v.id)) return false;
  insertConsentRecord(db, v);
  return true;
}

export function insertMemoIfAbsent(db: Database.Database, m: Memo): boolean {
  const v = Memo.parse(m);
  if (existsWithId(db, 'memos', v.id)) return false;
  insertMemo(db, v);
  return true;
}
