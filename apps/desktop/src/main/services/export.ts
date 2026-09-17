import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, makeRefId, type ArtifactType, type ConsentTemplateType } from '@openfield/core';
import AdmZip from 'adm-zip';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEntry } from './evidence';
import { getArtifact, getEncounter, getFieldEvent, setArtifactRefId, type ArtifactRecord } from './repos';
import { backupVault, type VaultPaths } from './vault';

export class ExportError extends Error {
  constructor(readonly code: 'no-encounter' | 'no-event' | 'no-consent' | 'io', message: string) {
    super(message);
  }
}

// 引用前置的知情同意门禁：对研究者严谨（§2.1），对受访者无感（§2.3）。
// 采集与封存永不拦截（录音发生在系统之外，拦截只能伤及真实田野）；
// 但签发学术引用时，可被引用的材料必须存在相应且未撤回的同意记录。
const REQUIRED_CONSENT: Partial<Record<ArtifactType, ConsentTemplateType>> = {
  audio: 'recording',
  photo: 'portrait',
};

export function makeCitation(
  db: Database.Database,
  input: { artifactId: string; actor: string; ts?: number },
): { refId: string; artifact: ArtifactRecord } {
  const artifact = getArtifact(db, input.artifactId);
  if (!artifact) throw new ExportError('io', `artifact 不存在：${input.artifactId}`);
  if (artifact.refId) return { refId: artifact.refId, artifact }; // A15：引用 ID 一经签发不可变更，重复调用幂等返回
  if (!artifact.encounterId) throw new ExportError('no-encounter', '采集物未挂访谈，无法定位引用时间与城市');
  const encounter = getEncounter(db, artifact.encounterId);
  if (!encounter) throw new ExportError('no-encounter', `encounter 不存在：${artifact.encounterId}`);

  const required = REQUIRED_CONSENT[artifact.type];
  if (required) {
    const hasConsent = db
      .prepare('SELECT 1 FROM consent_records WHERE encounter_id = ? AND template_type = ? AND withdrawn_at IS NULL LIMIT 1')
      .get(encounter.id, required);
    if (!hasConsent) {
      throw new ExportError(
        'no-consent',
        `该访谈尚无有效知情同意（${artifact.type} 类型材料需「${required}」类同意且未撤回），无法签发引用——请先记录同意书`,
      );
    }
  }

  const event = getFieldEvent(db, encounter.eventId);
  if (!event) throw new ExportError('no-event', `event 不存在：${encounter.eventId}`);

  const rawOffset = Math.floor((artifact.capturedAt - encounter.startedAt) / 1000);
  const offsetSeconds = Math.min(Math.max(rawOffset, 0), 5999);
  const seqKey = `${event.date.replaceAll('-', '')}-${event.cityCode}`;

  // 序号从 ref_sequences 单调递增分配，一经使用永不复用（purge 只删业务行，不回收此表）。
  // 不可按现存 artifacts 计数续号：purge 删行会让计数回退，轻则与既有 refId 唯一索引
  // 冲突（重试必然失败的永久阻断），重则复用已发表引用号（引用张冠李戴）。
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT last_seq FROM ref_sequences WHERE date_city = ?').get(seqKey) as { last_seq: number } | undefined;
    const seq = (row?.last_seq ?? 0) + 1;
    if (seq > 999) throw new ExportError('io', `该事件（${event.date} ${event.cityCode}）引用序号已达上限 999`);
    const refId = makeRefId({ date: event.date, cityCode: event.cityCode, seq, offsetSeconds });
    db.prepare(
      `INSERT INTO ref_sequences (date_city, last_seq) VALUES (?, ?)
       ON CONFLICT(date_city) DO UPDATE SET last_seq = excluded.last_seq`,
    ).run(seqKey, seq);
    setArtifactRefId(db, artifact.id, refId);
    appendEntry(db, {
      ts: input.ts ?? Date.now(),
      actor: input.actor,
      action: 'EXPORT',
      payloadHash: computePayloadHash({ artifactId: artifact.id, refId }),
    });
    return refId;
  });
  const refId = tx();
  return { refId, artifact: { ...artifact, refId } };
}

// 自研 OFBK1 容器：'OFBK1' + salt(16) + iv(12) + GCM tag(16) + AES-256-GCM(zip(vault.db 副本 + originals/))
const MAGIC = Buffer.from('OFBK1', 'ascii');

export function exportBackup(db: Database.Database, paths: VaultPaths, passphrase: string, outPath: string): void {
  if (existsSync(outPath)) throw new ExportError('io', `备份目标已存在：${outPath}`);
  const tmpDb = `${outPath}.tmp-vault.db`;
  try {
    rmSync(tmpDb, { force: true }); // A15：清掉上次崩溃残留的临时库，否则 backupVault 会因目标已存在而失败
    backupVault(db, tmpDb);
    const zip = new AdmZip();
    zip.addFile('vault.db', readFileSync(tmpDb));
    zip.addLocalFolder(paths.originalsRoot, 'originals');

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(passphrase, salt, 32);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(zip.toBuffer()), cipher.final()]);
    writeFileSync(outPath, Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]));
  } finally {
    rmSync(tmpDb, { force: true });
  }
}

export function readBackup(backupPath: string, passphrase: string): Buffer {
  const raw = readFileSync(backupPath);
  if (!raw.subarray(0, 5).equals(MAGIC)) throw new ExportError('io', '不是 OpenField 备份文件');
  const salt = raw.subarray(5, 21);
  const iv = raw.subarray(21, 33);
  const tag = raw.subarray(33, 49);
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(raw.subarray(49)), decipher.final()]);
}
