// 跨进程共享的 UI 载荷类型：main 组装、renderer 消费。
// 只放类型（零运行时代码）——实体类型直接从 @openfield/core 导入，
// 避免 renderer 手工复制实体 interface 后随实体演进漂移。
import type { Participant, ConsentRecord, Memo } from '@openfield/core';

export interface VaultStatus {
  home: string;
  hasVault: boolean;
  unlocked: boolean;
  events: number;
  encounters: number;
  pendingInbox: number;
}

export interface ScanSummary {
  pending: number;
  quarantined: number;
  skippedIcloud: number;
  skippedEmpty: number;
  appliedBundles: number;
}

export interface MockSummary {
  events: number;
  participants: number;
  encounters: number;
  artifacts: number;
  consents: number;
  memos: number;
  inboxFiles: number;
  citations: number;
}

export interface MockFootprint {
  events: number;
  encounters: number;
  artifacts: number;
}

export interface DetailPayload {
  participant: Participant | null;
  consents: ConsentRecord[];
  memos: Memo[];
}

export interface TimeSyncPayload {
  record: { checkedAt: number; ntpServer: string; offsetMs: number };
}
