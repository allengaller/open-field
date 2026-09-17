import type Database from 'better-sqlite3-multiple-ciphers';
import { verifyChain } from '@openfield/core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { listEvidenceEntries } from './evidence';
import { listArtifacts } from './repos';
import { sha256File } from './ingest';

export type VerifyIssueKind =
  | 'hash-mismatch'
  | 'original-missing'
  | 'orphan-directory'
  | 'unreadable'
  | 'anchor-mismatch'
  | 'anchor-unreadable';

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

// 链头锚点（A23，Plan 1 终审遗留义务）：截掉链尾的 evidence_log 内部仍自洽，
// chainOk 无法区分「未截断」与「截断到底」；把最近一次校验通过的链头哈希存在库外，
// 下次校验对不上即报 anchor-mismatch。锚点非密码学保护：删除锚点可重置锚定——
// 已记入威胁模型残余风险（磁盘级对手本就依赖整盘加密）。
interface ChainAnchor {
  head: string;
  seq: number;
  anchoredAt: number;
}

function readAnchor(anchorPath: string): { anchor: ChainAnchor | null; unreadable: boolean } {
  try {
    const raw = JSON.parse(readFileSync(anchorPath, 'utf8')) as Partial<ChainAnchor> | null;
    if (raw && typeof raw.head === 'string' && raw.head.length === 64 && typeof raw.seq === 'number') {
      return { anchor: { head: raw.head, seq: raw.seq, anchoredAt: raw.anchoredAt ?? 0 }, unreadable: false };
    }
    return { anchor: null, unreadable: true };
  } catch {
    return { anchor: null, unreadable: true };
  }
}

export async function runVerify(
  db: Database.Database,
  originalsRoot: string,
  opts: { anchorPath?: string } = {},
): Promise<VerifyReport> {
  const issues: VerifyIssue[] = [];

  const entries = listEvidenceEntries(db);
  const chain = verifyChain(entries);
  const chainOk = chain.ok;
  const chainBrokenAt = chain.ok ? null : chain.brokenAt;
  const chainReason = chain.ok ? null : chain.reason;

  // 锚点先于原始件检查：缺文件/坏锚点都只入报告，绝不静默重建（重建 = 重置锚定）
  const anchorPath = opts.anchorPath;
  let anchor: ChainAnchor | null = null;
  let anchorCompromised = false; // 坏锚点/不匹配：保留现场，本次不覆写
  if (anchorPath && existsSync(anchorPath)) {
    const read = readAnchor(anchorPath);
    if (read.unreadable) {
      issues.push({ kind: 'anchor-unreadable', message: `链头锚点无法解析，请人工核查后删除重建：${anchorPath}` });
      anchorCompromised = true;
    } else {
      anchor = read.anchor;
    }
  }
  const last = entries.at(-1);
  if (anchor && chainOk) {
    // 链头等于锚点（无新增）或锚点 seq 处哈希未变（锚后正常追加）都算对得上；
    // 链为空（截断到底）时无任何位置能对上锚点 → 同样是 mismatch
    const stillAnchored = last ? (anchor.head === last.entryHash || entries[anchor.seq]?.entryHash === anchor.head) : false;
    if (!stillAnchored) {
      issues.push({ kind: 'anchor-mismatch', message: '链头锚点与当前链不符：链可能在最近一次校验之后被截断或回退' });
      anchorCompromised = true;
    }
  }

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

  // 锚点写入：仅当链校验通过且锚点未被判定异常（坏锚点/不匹配保留现场）
  if (anchorPath && chainOk && last && !anchorCompromised) {
    const fresh: ChainAnchor = { head: last.entryHash, seq: last.seq, anchoredAt: Date.now() };
    writeFileSync(anchorPath, JSON.stringify(fresh));
  }

  return { chainOk, chainBrokenAt, chainReason, issues, artifactCount: artifacts.length, checkedAt: Date.now() };
}
