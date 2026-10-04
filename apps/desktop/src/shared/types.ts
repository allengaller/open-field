// 跨进程共享的 UI 载荷类型：main 组装、renderer 消费。
// 类型唯一定义处是 shared/schemas.ts（zod schema + z.infer）——本文件只做转发，
// 避免出现「schema 与 interface 各自手抄」的第二事实源。
// 实体类型直接从 @openfield/core 导入，不在此复制。
export type {
  VaultStatus,
  SavedKeyStatus,
  ScanSummary,
  MockSummary,
  MockFootprint,
  AppSettings,
  DetailPayload,
  TimeSyncPayload,
  ResearchPayload,
} from './schemas';

// research.ts 的构建函数返回类型（与 research:load 载荷共用同一 schema 事实源）
export type { ResearchTimelineRow as TimelineRow } from './schemas';
