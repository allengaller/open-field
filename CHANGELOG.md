# Changelog 变更日志

All notable changes to OpenField are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning adopts [SemVer](https://semver.org/) from the first tagged release.
OpenField 的所有显著变更记录于此。体例遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)；自首个正式版本起采用[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed
- Desktop workbench redesigned as a professional tool-platform UI (Cobalt design system: cool engineered paper, electric-cobalt signal accent, Space Grotesk + Inter + JetBrains Mono bundled locally for offline use; 4pt scale, 8-state interactions, reduced-motion support). All e2e element IDs and data contracts preserved.
  桌面工作台重构为专业工具平台 UI（Cobalt 设计系统：冷调工程纸面、电钴蓝信号色、本地打包字体离线可用；4pt 间距、八态交互、动效降级）。e2e 元素 ID 与数据契约原样保留。
- Inbox pending rows now surface scan-time suggestions (`建议归入 enc-…`) and adopt the suggested encounter when confirming with an empty field; Event/Encounter registration accepts context notes.
  收件箱待办显示扫描时推断的建议归属，确认时可自动采纳；事件/访谈登记新增背景注记与备注字段。
- User guide (`docs/USER_GUIDE.md`) updated to V1.2 covering the full workbench, demo data, and the PIPL danger zone.
  使用手册更新至 V1.2，覆盖完整工作台、演示数据与 PIPL 危险区操作。

### Added
- Editable demo-data module (`apps/desktop/src/main/services/mock-data.ts` + `mock.ts`): one-click load/clear of a fieldwork dataset (events, participants with snowball referral chains, encounters, hash-sealed artifacts, consent records incl. withdrawn, memos, pending inbox files, one issued citation) — loaded through the real ingest path so the evidence chain stays verifiable; clearing keeps the append-only log per the immutable-ledger rule; unit-tested roundtrip.
  可编辑演示数据模块：一键载入/清除一套示例田野数据，全部走真实入库路径（哈希链可校验）；清除按 append-only 铁律保留链条目；含单测往返覆盖。
- Workbench gap fills: evidence-log viewer (per-entry seq/time/action/actor/hash), memo confirm-to-archive (`memos:confirm`), one-click field-journal generation (`journals:build`), participant profile entry (`participants:upsert`), consent recording (`consents:record`), NTP time-sync button (`time:sync`), PIPL purge danger zone UI (double-input confirmation token), demo-data status chip (`mock:status`).
  工作台补全：链日志查看、备忘录确认入档、田野日志一键生成、受访者建档、知情同意录入、时间同步按钮、PIPL 危险区界面（双输入确认令牌）、演示数据状态芯片。
- Playwright E2E feature suite (`e2e/features.e2e.ts`): demo load → profile entry → consent → memo confirm → journal → PIPL purge (token mismatch rejected, then success) → chain integrity after purge.
  Playwright 功能补全 E2E：演示载入 → 建档 → 同意 → 备忘录确认 → 日志 → PIPL 清除（令牌不一致被拒与成功路径）→ 清除后链完整。
- Project constitution: `PRINCIPLES.md` — the six non-negotiables for fieldwork-grade AI.
  项目宪法：田野级 AI 的六条不可妥协项。
- Ethics Self-Review Checklist: `docs/ETHICS_CHECKLIST.md`, wired into PRINCIPLES.md §7.
  伦理自查清单，并接入 PRINCIPLES.md 第 7 节。
- Contributor kit: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, PR and issue templates.
  贡献者套件：贡献指南、行为准则、安全策略、PR 与议题模板。
- Project license and citation metadata: `LICENSE` (MIT), `CITATION.cff`, `CODEOWNERS`.
  项目许可证与引用元数据：MIT 许可证、引用文件与代码归属路由。
- `packages/core` (`@openfield/core`): zod data model for nine entities (FieldEvent, Encounter, Artifact, Participant, ConsentRecord, Memo, InboxItem, TimeSyncRecord, EvidenceEntry), the append-only SHA-256 hash chain, canonical-JSON payload hashing, RefId (`OF-YYYYMMDD-CCC-NNN[#Tmm:ss]`), and the BundleV1 exchange format.
  核心包：九实体 zod 数据模型、仅可追加的 SHA-256 哈希链、规范化 JSON 载荷哈希、引用 ID 与 BundleV1 交换格式。
- `apps/desktop` (`@openfield/desktop`): Electron shell with typed IPC and sandboxed renderer; SQLCipher-encrypted vault with versioned migrations; artifact ingest with hash freezing, read-only sealing (temp+rename), and idempotent dedup; inbox watcher with quarantine for malformed bundles; bundle application for mobile hand-off; full verification (chain replay, originals re-hash, orphan detection); RefId citation issuance; PIPL cascade purge with confirmation token; OFBK1 encrypted backup container; NTP time sync recorded on-chain; daily field journal aggregation.
  桌面端：Electron 薄壳 + 类型化 IPC；SQLCipher 加密资料库与版本迁移；采集物哈希固化、只读封存与幂等去重；收件箱监听与畸形 bundle 隔离；手机端 bundle 接收；完整性校验（链重放 + 原始件重算 + 孤儿检测）；引用 ID 签发；PIPL 级联清除（确认令牌防误清）；OFBK1 加密备份容器；NTP 校时入链；每日田野日志聚合。
- Playwright Electron E2E smoke covering vault creation → event/encounter registration → inbox ingest → citation.
  Playwright Electron 冒烟测试：建库 → 事件/访谈登记 → 收件箱导入 → 引用签发。
- Fieldwork methodology corpus: `docs/fieldwork/` — a 12-chapter Chinese knowledge base with glossary and verified reference index, the knowledge base of OpenField's methodology engine.
  田野调查方法论语料库：面向 IT 从业者的 12 章中文知识库，附术语表与已核验参考文献索引。
- Campaign plan: `docs/CAMPAIGN.md` — the real-world battlefield, business model, and requirement source behind OpenField.
  田野行动总纲：OpenField 背后的真实战场、商业模式与需求源。
- Architecture spec and implementation plans: `docs/superpowers/` — ratified P1 design plus task-by-task plans with recorded review deviations.
  架构规格与实现计划：已确认的 P1 设计，及逐任务实现计划与评审偏离记录。
- Monorepo tooling: pnpm workspace, and GitHub Actions CI (typecheck + tests on Node 22).
  仓库工程化：pnpm workspace 与 GitHub Actions CI（Node 22 上执行类型检查与测试）。
- Documentation suite: as-built architecture reference (`docs/ARCHITECTURE.md`), threat model (`docs/THREAT_MODEL.md`), desktop user guide (`docs/USER_GUIDE.md`), and a docs index (`docs/README.md`); README rewritten to reflect the implemented system.
  文档套件：as-built 架构参照（docs/ARCHITECTURE.md）、威胁模型（docs/THREAT_MODEL.md）、桌面端使用手册（docs/USER_GUIDE.md）与文档索引（docs/README.md）；README 全面重写以反映已实现系统。
- Go-to-market plan (`gtm/README.md`): thesis, market gap, ICP tiers, positioning and messaging house, business model aligned with the campaign's revenue lines, channel and content strategy, four-phase launch with gates, fieldwork-language funnel and north-star metric, and risk red lines.
  市场进入计划（gtm/README.md）：主论题、市场缺口、ICP 分层、定位与信息屋、对齐收益线的商业模式、渠道与内容策略、带闸门的四阶段发布、田野语言漏斗与北极星指标、风险红线。
- Project website (`website/`): a single-page official site (mission, five-layer architecture, capabilities, evidence chain, principles, roadmap) reusing the desktop cobalt design language with locally bundled fonts; published to Meoo CDN (v1).
  项目官网（website/）：单页官网（使命、五层架构、能力、证据链、宪法、路线图），复用桌面端钴蓝设计语言与本地字体；已发布至 Meoo CDN（v1）。
- Informed-consent gate: `makeCitation` now rejects audio without an unwithdrawn `recording` consent and photos without an unwithdrawn `portrait` consent (`no-consent`); capture and sealing stay unobstructed — rigor for the researcher, invisible to the participant (PRINCIPLES §2.1/§2.3). Withdrawal is user-facing: `consents:withdraw` appends a `CONSENT_WITHDRAW` chain entry and the gate takes effect immediately.
  知情同意门禁：`makeCitation` 拒绝无未撤回 recording 同意的音频与无未撤回 portrait 同意的照片（no-consent）；采集与封存永不拦截——对研究者严谨、对受访者无感（PRINCIPLES §2.1/§2.3）。撤回已接入界面：`consents:withdraw` 以 `CONSENT_WITHDRAW` 入链，门禁即刻生效。
- Real-name mapping path: `participants:set-real-name` writes into the encrypted `participant_identity` table only, deliberately **not** recorded on-chain (deterministic hashes of real names are dictionary-attackable; chain payloads carry pseudonyms and counts only). UI entry lives in the participant form.
  真名映射路径：`participants:set-real-name` 只写入加密库的 `participant_identity` 表，刻意**不入证据链**（真名的确定性哈希可被字典攻击；链载荷只允许化名与计数）。界面入口位于受访者建档表单。

### Fixed
- RefId sequence allocation is now monotonic and never reused: a new `ref_sequences` table (migration v2, backfilled from existing `ref_id` values) issues citation numbers, and PIPL purge no longer causes either a permanent `UNIQUE constraint` block (previously: re-issuing after purging a lower-published number retried forever) or reuse of an already-published number (previously: purging the highest number rolled the counter back). Regression tests cover both scenarios.
  RefId 序号改为单调分配、永不复用：新增 `ref_sequences` 表（迁移 v2，从既有 ref_id 回填）签发引用序号；PIPL 清除后不再出现永久性唯一索引冲突（此前清除低序号后重新签发会“重试”致死）或复用已发表引用号（此前清除最高序号后计数回退）。两个场景均有回归测试。
- `inbox:list` IPC input now validates `status` against the `InboxStatus` enum (previously any string passed through to the SQL query).
  `inbox:list` 的 `status` 入参改为 InboxStatus 枚举校验（此前任意字符串均可透传到 SQL 查询）。
- Bundle mediaRef de-duplication now updates the seen-set inside the loop, so duplicate filenames within one bundle produce a single inbox item (matching the documented intent).
  bundle 媒体引用去重改为循环内同步更新集合：同一 bundle 内重复 filename 现在只落一条收件项（与注释声明的行为一致）。
