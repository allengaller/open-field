import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, makeRefId, type ArtifactType, type ConsentTemplateType } from '@openfield/core';
import AdmZip from 'adm-zip';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { appendEntry } from './evidence';
import { getArtifact, getEncounter, getFieldEvent, setArtifactRefId, type ArtifactRecord } from './repos';
import { backupVault, openVault, resolveVaultPaths, type VaultPaths } from './vault';

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

// 自研备份容器：
//  OFBK1（旧）: 'OFBK1' + salt(16) + iv(12) + GCM tag(16) + AES-256-GCM(zip(vault.db 副本 + originals/))
//  OFBK2（A24）: 'OFBK2' + version(u32) + N(u32) + r(u32) + p(u32) + salt(16) + iv(12) + tag(16) + 同上密文
// KDF 参数显式入头，未来再调参数无需再分叉格式；旧 OFBK1（隐式 scrypt 默认 N=2^14）永久可读。
const MAGIC_V1 = Buffer.from('OFBK1', 'ascii');
const MAGIC_V2 = Buffer.from('OFBK2', 'ascii');
const KDF_V2 = { N: 2 ** 17, r: 8, p: 1 } as const; // OWASP 交互式口令建议档
const SCRYPT_MAXMEM = 512 * 1024 * 1024; // N=2^17, r=8 需 ~134MB，超出 Node 默认 32MB 上限

function writeU32(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeUInt32LE(v, i * 4));
  return buf;
}

export function exportBackup(db: Database.Database, paths: VaultPaths, passphrase: string, outPath: string): void {
  if (existsSync(outPath)) throw new ExportError('io', `备份目标已存在：${outPath}`);
  const tmpDb = `${outPath}.tmp-vault.db`;
  const tmpOut = `${outPath}.tmp`;
  try {
    rmSync(tmpDb, { force: true }); // A15：清掉上次崩溃残留的临时库，否则 backupVault 会因目标已存在而失败
    rmSync(tmpOut, { force: true }); // A24：崩溃残留的半截容器不占用最终路径，也不阻塞重试
    backupVault(db, tmpDb);
    const zip = new AdmZip();
    zip.addFile('vault.db', readFileSync(tmpDb));
    zip.addLocalFolder(paths.originalsRoot, 'originals');

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(passphrase, salt, 32, { ...KDF_V2, maxmem: SCRYPT_MAXMEM });
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const header = Buffer.concat([MAGIC_V2, writeU32(2, KDF_V2.N, KDF_V2.r, KDF_V2.p), salt, iv]);
    const ciphertext = Buffer.concat([cipher.update(zip.toBuffer()), cipher.final()]);
    // 原子写：最终路径上只可能出现完整容器（A22 的「存在即完成」语义因此不被半截文件破坏）
    writeFileSync(tmpOut, Buffer.concat([header, cipher.getAuthTag(), ciphertext]));
    renameSync(tmpOut, outPath);
  } finally {
    rmSync(tmpDb, { force: true });
    rmSync(tmpOut, { force: true });
  }
}

export function readBackup(backupPath: string, passphrase: string): Buffer {
  const raw = readFileSync(backupPath);
  if (raw.subarray(0, 5).equals(MAGIC_V1)) {
    const salt = raw.subarray(5, 21);
    const iv = raw.subarray(21, 33);
    const tag = raw.subarray(33, 49);
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(49)), decipher.final()]);
  }
  if (raw.subarray(0, 5).equals(MAGIC_V2)) {
    const [version, N, r, p] = [raw.readUInt32LE(5), raw.readUInt32LE(9), raw.readUInt32LE(13), raw.readUInt32LE(17)];
    if (version !== 2) throw new ExportError('io', `不支持的备份容器版本：${version}`);
    // 头部参数来自文件，先夹在合理范围内，防止恶意文件借超大 N 触发内存耗尽
    if (N < 2 ** 14 || N > 2 ** 21 || r < 8 || r > 64 || p < 1 || p > 8) {
      throw new ExportError('io', `备份容器的 KDF 参数超出合理范围（N=${N}, r=${r}, p=${p}）`);
    }
    const salt = raw.subarray(21, 37);
    const iv = raw.subarray(37, 49);
    const tag = raw.subarray(49, 65);
    const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32, { N, r, p, maxmem: SCRYPT_MAXMEM }), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(65)), decipher.final()]);
  }
  throw new ExportError('io', '不是 OpenField 备份文件');
}

// 恢复闭环：解密解包 → 包内库用「资料库口令」开启（校验口令）并把 original_path 重写到新家
// （库里存绝对路径，换机/换目录后必须改指新 originals）→ originals 先落位并恢复只读位，
// vault.db 最后原子落位——它的存在即「恢复完成」标记，任何中断都不会留下看似完整的库。
export function restoreBackup(input: {
  backupPath: string;
  backupPassphrase: string;
  vaultPassphrase: string;
  home: string;
}): void {
  const target = resolveVaultPaths(input.home);
  if (existsSync(target.vaultDb)) {
    throw new ExportError('io', `目标目录已存在资料库，拒绝覆盖：${target.vaultDb}`);
  }
  const zip = new AdmZip(readBackup(input.backupPath, input.backupPassphrase));
  if (!zip.getEntry('vault.db')) throw new ExportError('io', '备份包内缺少 vault.db，文件不完整或损坏');
  rmSync(target.chainAnchor, { force: true }); // A23：旧锚点指向丢失库的链头，保留会在恢复后误报 anchor-mismatch
  const staging = mkdtempSync(join(dirname(input.home), 'of-restore-')); // 与 home 同卷，rename 才是原子
  try {
    zip.extractAllTo(staging, true);
    const staged = openVault(resolveVaultPaths(staging), input.vaultPassphrase, false);
    try {
      const rows = staged.prepare('SELECT id, original_path FROM artifacts').all() as { id: string; original_path: string }[];
      const update = staged.prepare('UPDATE artifacts SET original_path = ? WHERE id = ?');
      staged.transaction(() => {
        for (const r of rows) update.run(join(target.originalsRoot, r.id, basename(r.original_path)), r.id);
      })();
    } finally {
      staged.close();
    }

    mkdirSync(target.originalsRoot, { recursive: true });
    const stagedOriginals = join(staging, 'originals');
    if (existsSync(stagedOriginals)) {
      for (const id of readdirSync(stagedOriginals)) {
        const dest = join(target.originalsRoot, id);
        if (existsSync(dest)) throw new ExportError('io', `originals 已存在同名目录，拒绝覆盖：${id}`);
        renameSync(join(stagedOriginals, id), dest);
        for (const f of readdirSync(dest)) chmodSync(join(dest, f), 0o444); // 恢复只读封存位
      }
    }
    renameSync(join(staging, 'vault.db'), target.vaultDb);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
