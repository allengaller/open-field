import type Database from 'better-sqlite3-multiple-ciphers';
import { verifyChain } from '@openfield/core';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { listEvidenceEntries } from './evidence';
import { listArtifacts } from './repos';
import { sha256File } from './ingest';

export type VerifyIssueKind = 'hash-mismatch' | 'original-missing' | 'orphan-directory' | 'unreadable';

export interface VerifyIssue {
  kind: VerifyIssueKind;
  message: string;
  artifactId?: string;
  path?: string;
}

export interface VerifyReport {
  chainOk: boolean;
  chainBrokenAt: number | null;
  chainReason: string | null;
  issues: VerifyIssue[];
  artifactCount: number;
  checkedAt: number;
}

export async function runVerify(db: Database.Database, originalsRoot: string): Promise<VerifyReport> {
  const issues: VerifyIssue[] = [];

  const chain = verifyChain(listEvidenceEntries(db));
  const chainOk = chain.ok;
  const chainBrokenAt = chain.ok ? null : chain.brokenAt;
  const chainReason = chain.ok ? null : chain.reason;

  const artifacts = listArtifacts(db);
  for (const a of artifacts) {
    try {
      const stored = await sha256File(a.originalPath);
      if (stored !== a.sha256) {
        issues.push({
          kind: 'hash-mismatch',
          message: `原始件哈希不匹配：登记 ${a.sha256.slice(0, 8)}…，实测 ${stored.slice(0, 8)}…`,
          artifactId: a.id,
          path: a.originalPath,
        });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        issues.push({ kind: 'original-missing', message: `原始件文件缺失：${a.id}`, artifactId: a.id, path: a.originalPath });
      } else {
        issues.push({ kind: 'unreadable', message: `原始件不可读：${a.id}（${String(err)}）`, artifactId: a.id, path: a.originalPath });
      }
    }
  }

  const known = new Set(artifacts.map((a) => a.id));
  let names: string[];
  try {
    names = await readdir(originalsRoot);
  } catch (err) {
    issues.push({ kind: 'unreadable', message: `originals 目录不可读，孤儿目录检查未执行：${String(err)}`, path: originalsRoot }); // A11：检查失败必须可见，不得静默
    names = [];
  }
  for (const name of names) {
    if (known.has(name)) continue;
    const full = join(originalsRoot, name);
    const st = await stat(full).catch(() => null); // A11：条目消失等 stat 失败 → 跳过，不使整个报告作废
    if (!st) continue;
    if (st.isDirectory()) {
      issues.push({ kind: 'orphan-directory', message: `originals 下存在未登记目录：${name}`, path: full });
    }
  }

  return { chainOk, chainBrokenAt, chainReason, issues, artifactCount: artifacts.length, checkedAt: Date.now() };
}
