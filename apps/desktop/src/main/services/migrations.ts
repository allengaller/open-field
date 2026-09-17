import type Database from 'better-sqlite3-multiple-ciphers';

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE field_events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  city_code TEXT NOT NULL,
  location_name TEXT NOT NULL,
  gps_lat REAL,
  gps_lng REAL,
  context_note TEXT
);
CREATE TABLE encounters (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES field_events(id),
  participant_ref TEXT NOT NULL,
  sampling_reason TEXT NOT NULL,
  consent_record_id TEXT,
  started_at INTEGER NOT NULL,
  note TEXT
);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  encounter_id TEXT REFERENCES encounters(id),
  event_id TEXT REFERENCES field_events(id),
  type TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  gps_lat REAL,
  gps_lng REAL,
  device_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ref_id TEXT,
  original_path TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_artifacts_ref_id ON artifacts(ref_id);
CREATE TABLE participants (
  pseudonym TEXT PRIMARY KEY,
  industry TEXT,
  region TEXT,
  referral_chain TEXT,
  consent_scope TEXT
);
CREATE TABLE participant_identity (
  pseudonym TEXT PRIMARY KEY REFERENCES participants(pseudonym),
  real_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  template_type TEXT NOT NULL,
  signature_artifact_id TEXT,
  verbal_consent_artifact_id TEXT,
  scope TEXT NOT NULL,
  withdrawn_at INTEGER
);
CREATE TABLE memos (
  id TEXT PRIMARY KEY,
  linked_artifact_ids TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  sha256 TEXT,
  suggested_event_id TEXT,
  suggested_encounter_id TEXT,
  status TEXT NOT NULL
);
CREATE TABLE time_sync_records (
  id TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL,
  ntp_server TEXT NOT NULL,
  offset_ms INTEGER NOT NULL
);
CREATE TABLE evidence_log (
  seq INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL
);
CREATE TRIGGER evidence_log_no_update
BEFORE UPDATE ON evidence_log
BEGIN
  SELECT RAISE(ABORT, 'evidence_log is append-only');
END;
CREATE TRIGGER evidence_log_no_delete
BEFORE DELETE ON evidence_log
BEGIN
  SELECT RAISE(ABORT, 'evidence_log is append-only');
END;
`,
  },
  {
    version: 2,
    // refId 序号分配表：单调递增、永不复用（purge 不回收此表）。
    // 回填从现存 ref_id 解析（'OF-YYYYMMDD-CCC-NNN[#Tmm:ss]'）：升级库时保留历史最高序号，
    // 避免升级后首次签发与既有 refId 冲突。GLOB 过滤保证只解析标准格式。
    sql: `
CREATE TABLE ref_sequences (
  date_city TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL
);
INSERT INTO ref_sequences (date_city, last_seq)
SELECT substr(ref_id, 4, 8) || '-' || substr(ref_id, 13, 3), MAX(CAST(substr(ref_id, 17, 3) AS INTEGER))
FROM artifacts
WHERE ref_id GLOB 'OF-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[A-Z][A-Z][A-Z]-[0-9][0-9][0-9]*'
GROUP BY substr(ref_id, 4, 8), substr(ref_id, 13, 3);
`,
  },
];

export function applyMigrations(db: Database.Database): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  );
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const applied = new Set(rows.map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now());
    })();
  }
}
