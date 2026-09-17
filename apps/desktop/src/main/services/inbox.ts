import type Database from 'better-sqlite3-multiple-ciphers';
import { computePayloadHash, decodeBundle, type Bundle } from '@openfield/core';
import { appendEntry } from './evidence';
import { mkdir, readFile, rename, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  getInboxItemBySourcePath, insertConsentRecordIfAbsent, insertEncounterIfAbsent, insertFieldEventIfAbsent,
  insertInboxItem, insertMemoIfAbsent, insertParticipantIfAbsent, listFieldEvents, listInboxItems,
} from './repos';

export interface InboxDirs {
  inboxDir: string;
  quarantineDir: string;
}

export interface ScanSummary {
  pending: number;
  quarantined: number;
  skippedIcloud: number;
  skippedEmpty: number;
  appliedBundles: number;
}

const ICLOUD_STUB = /^\..+\.icloud$/;

export function applyBundle(db: Database.Database, bundle: Bundle): void {
  const actor = `bundle:${bundle.id}`;
  const ts = bundle.createdAt;
  const tx = db.transaction(() => {
    const seenSourcePaths = new Set(listInboxItems(db).map((i) => i.sourcePath)); // mediaRef 去重：同 bundle 同名文件只生成一条
    for (const e of bundle.events) if (insertFieldEventIfAbsent(db, e)) appendEntry(db, { ts, actor, action: 'CREATE_EVENT', payloadHash: computePayloadHash(e) });
    for (const p of bundle.participants) if (insertParticipantIfAbsent(db, p)) appendEntry(db, { ts, actor, action: 'CREATE_PARTICIPANT', payloadHash: computePayloadHash(p) });
    for (const c of bundle.encounters) if (insertEncounterIfAbsent(db, c)) appendEntry(db, { ts, actor, action: 'CREATE_ENCOUNTER', payloadHash: computePayloadHash(c) });
    for (const c of bundle.consents) if (insertConsentRecordIfAbsent(db, c)) appendEntry(db, { ts, actor, action: 'CONSENT_RECORDED', payloadHash: computePayloadHash(c) });
    for (const m of bundle.memos) if (insertMemoIfAbsent(db, m)) appendEntry(db, { ts, actor, action: 'CREATE_MEMO', payloadHash: computePayloadHash(m) });
    for (const m of bundle.mediaRefs) {
      const sourcePath = `bundle:${bundle.id}:${m.filename}`;
      if (seenSourcePaths.has(sourcePath)) continue;
      seenSourcePaths.add(sourcePath); // 同步更新：同一 bundle 内重复 filename 也只落一条
      insertInboxItem(db, {
        id: `inbox-${randomUUID()}`,
        sourcePath,
        detectedAt: bundle.createdAt,
        sha256: m.sha256,
        suggestedEncounterId: m.encounterId,
        status: 'pending',
      });
    }
  });
  tx();
}

function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function suggestEventId(db: Database.Database, mtimeMs: number): string | undefined {
  const date = localDate(mtimeMs);
  return listFieldEvents(db, date)[0]?.id;
}

export async function scanOnce(db: Database.Database, dirs: InboxDirs): Promise<ScanSummary> {
  const summary: ScanSummary = { pending: 0, quarantined: 0, skippedIcloud: 0, skippedEmpty: 0, appliedBundles: 0 };
  let names: string[];
  try {
    names = await readdir(dirs.inboxDir);
  } catch {
    return summary; // 目录不存在视为空
  }

  for (const name of names.sort()) {
    const full = join(dirs.inboxDir, name);
    const st = await stat(full).catch(() => null);
    if (!st) continue; // 扫描途中文件消失等 stat 失败：跳过，不中断整轮扫描
    if (!st.isFile()) continue;
    if (ICLOUD_STUB.test(name)) {
      summary.skippedIcloud += 1; // iCloud 未下载完的占位文件：等它变成本体
      continue;
    }
    if (st.size === 0) {
      summary.skippedEmpty += 1; // macOS 14+ dataless 文件大小为 0：不当原始件
      continue;
    }
    // 同路径已有 pending（待人工确认）或 ingested（重复投放）记录 → 跳过
    if (getInboxItemBySourcePath(db, full, 'pending') || getInboxItemBySourcePath(db, full, 'ingested')) continue;

    if (name.endsWith('.ofbundle.json')) {
      try {
        const bundle = decodeBundle(await readFile(full, 'utf8'));
        applyBundle(db, bundle);
        insertInboxItem(db, { id: `inbox-${randomUUID()}`, sourcePath: full, detectedAt: Date.now(), status: 'ingested' });
        summary.appliedBundles += 1;
      } catch (err) {
        console.warn('[inbox] bundle 处理失败，移入隔离区：', name, err);
        try {
          await mkdir(dirs.quarantineDir, { recursive: true });
          const dest = join(dirs.quarantineDir, `${randomUUID().slice(0, 8)}-${name}`); // 随机前缀防同名覆盖
          await rename(full, dest);
          insertInboxItem(db, { id: `inbox-${randomUUID()}`, sourcePath: dest, detectedAt: Date.now(), status: 'quarantined' });
          summary.quarantined += 1;
        } catch (moveErr) {
          console.warn('[inbox] 隔离区移动失败，跳过该文件：', name, moveErr);
        }
      }
      continue;
    }

    insertInboxItem(db, {
      id: `inbox-${randomUUID()}`,
      sourcePath: full,
      detectedAt: Date.now(),
      suggestedEventId: suggestEventId(db, st.mtimeMs),
      status: 'pending',
    });
    summary.pending += 1;
  }
  return summary;
}
