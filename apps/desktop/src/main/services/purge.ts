import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash } from '@openfield/core';
import { chmodSync, readdirSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { appendEntry } from './evidence';
import { listArtifactsByEncounter, listConsentsByEncounter, listMemos } from './repos';

export interface PurgeScope {
  pseudonym: string;
  encounters: number;
  consents: number;
  artifacts: number;
  memos: number;
}

type Row = Record<string, unknown>;

export function purgeSubject(
  db: Database.Database,
  originalsRoot: string,
  input: { pseudonym: string; confirmToken: string; actor: string; ts?: number },
): PurgeScope {
  if (input.confirmToken !== input.pseudonym) {
    throw new Error('confirmToken 必须与 pseudonym 完全一致（防误清），且清除不可撤销');
  }

  const encounters = (db.prepare('SELECT * FROM encounters WHERE participant_ref = ?').all(input.pseudonym) as Row[]).map((r) => r.id as string);
  const consents = encounters.flatMap((encId) => listConsentsByEncounter(db, encId));
  const artifacts = encounters.flatMap((encId) => listArtifactsByEncounter(db, encId));
  const artifactIds = new Set(artifacts.map((a) => a.id));
  const memos = listMemos(db).filter((m) => m.linkedArtifactIds.some((id) => artifactIds.has(id)));
  const scope: PurgeScope = {
    pseudonym: input.pseudonym,
    encounters: encounters.length,
    consents: consents.length,
    artifacts: artifacts.length,
    memos: memos.length,
  };

  // 先删文件再删库：若 DB 事务失败，隐私已消失、登记残留会被 verify 以 original-missing 可见报告
  // 不回收 ref_sequences 序号水位（见 export.makeCitation）：RefId 一经分配永不复用，
  // 被清除材料的编号保持「已烧毁」——否则重新签发会复用已发表引用号或撞唯一索引。
  for (const a of artifacts) {
    const dir = join(originalsRoot, a.id);
    const rel = relative(originalsRoot, dir);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`artifact 目录越界，拒绝删除：${a.id}`); // A14：id 来自 DB，不得借路径穿越删到 originalsRoot 之外
    }
    try {
      for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o644); // A12：封存件 0444，先恢复可写（Windows 只读位阻止删除；POSIX 无害）
    } catch {
      // 目录缺失等：交给 rmSync 的 force 处理
    }
    rmSync(dir, { recursive: true, force: true });
  }

  const tx = db.transaction(() => {
    for (const m of memos) db.prepare('DELETE FROM memos WHERE id = ?').run(m.id);
    for (const a of artifacts) db.prepare('DELETE FROM artifacts WHERE id = ?').run(a.id);
    for (const c of consents) db.prepare('DELETE FROM consent_records WHERE id = ?').run(c.id);
    for (const encId of encounters) db.prepare('DELETE FROM encounters WHERE id = ?').run(encId);
    db.prepare('DELETE FROM participant_identity WHERE pseudonym = ?').run(input.pseudonym);
    db.prepare('DELETE FROM participants WHERE pseudonym = ?').run(input.pseudonym);
    appendEntry(db, { ts: input.ts ?? Date.now(), actor: input.actor, action: 'PURGE_SUBJECT', payloadHash: computePayloadHash(scope) });
  });
  tx();
  return scope;
}
