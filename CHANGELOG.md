# Changelog 变更日志

All notable changes to OpenField are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning adopts [SemVer](https://semver.org/) from the first tagged release.
OpenField 的所有显著变更记录于此。体例遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)；自首个正式版本起采用[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- Remember-vault-passphrase (A36): with 「记住口令」 checked, the vault passphrase is wrapped by the OS safeStorage (macOS Keychain) into `remembered.bin` (mode 0600, bound to the data directory, never written when safeStorage is unavailable); three new channels — `vault:saved-key-status`, `vault:unlock-saved`, `vault:forget-saved`. A decrypt failure (different machine, tampered file) auto-deletes the envelope, and a wrong-key unlock clears it too.
  记住口令（A36）：勾选「记住口令」开库/建库时，口令经 OS safeStorage（macOS Keychain）加密封装为 `remembered.bin`（0600、绑定数据目录、safeStorage 不可用时不落盘）；新增 `vault:saved-key-status` / `vault:unlock-saved` / `vault:forget-saved` 三个通道。解密失败（换机/文件被篡改）自动删除信封，错口令解锁同样清除。
- Idle auto-lock (A37): every IPC call refreshes an activity timestamp; a timer closes the vault after `auto_lock_minutes` of inactivity (default 15, `0` disables) and broadcasts `vault:locked` so the UI returns to the locked state; the inbox watcher already refuses to run while locked. This guards the forgotten-unlock window, not a deliberate local adversary.
  空闲自动锁定（A37）：任意 IPC 活动刷新计时；空闲超过 `auto_lock_minutes`（默认 15，`0` = 关闭）即关库并广播 `vault:locked` 回到锁定态；收件箱 watcher 本就未解锁不扫。防的是「忘了锁」的窗口期，不是蓄意的本机对手。
- Device alias (A34): a pseudonymous device alias (new `app_settings` table, migration v4) replaces `os.hostname()` as the chain actor and artifact `device_id` once set — hostname fingerprints no longer leak into the evidence log; historical entries stay immutable per the append-only rule. Auto-lock minutes live in the same settings table.
  设备代号（A34）：设置设备代号后（新 `app_settings` 表，迁移 v4），证据链 actor 与采集物 `device_id` 改用代号而非 `os.hostname()`——主机名指纹不再泄入证据链；历史条目按 append-only 铁律保持原样。自动锁定分钟数同表存储。
- Demo-data write gate (A32): packaged builds reject `mock:load` / `mock:clear` so the real field vault can never be mixed with demo rows; `mock:status` stays read-only.
  演示数据写入门禁（A32）：打包版拒绝 `mock:load` / `mock:clear`（真实田野资料库永不混入演示行）；`mock:status` 只读不受限。
- The knowledge build-time sanitizer now also rejects event-handler attributes (`on*=`) in generated HTML, closing the last attribute-injection vector alongside the existing `<script` / `javascript:` checks.
  knowledge 构建期消毒新增事件处理器属性拦截（生成 HTML 中出现 `on*=` 即拒绝），与既有 `<script` / `javascript:` 检查共同封死属性注入向量。
- Runtime IPC response validation: every channel now has a zod schema in `shared/schemas.ts` (`Record<IpcChannel, …>` — a missing channel fails to compile); the renderer's `invoke` parses responses against the schema (quiet variant degrades silently); UI payload types in `shared/types.ts` are now `z.infer` forwards, making the schema the single source of truth. A new drift-pinning test invokes every live channel handler (demo dataset, real ingest paths) and asserts the envelope + schema; a new channel absent from the pin set fails the test. `time:sync` (NTP), `backup:pick` (native dialog) and `vault:unlock-saved` (safeStorage) are exempt from live invocation and covered by the syncTime unit test and E2E respectively.
  IPC 响应运行时校验：`shared/schemas.ts` 为每个通道定义 zod schema（`Record<IpcChannel, …>`，缺通道编译即错）；renderer `invoke` 按通道 parse（静默版失配静默降级）；`shared/types.ts` 的 UI 载荷类型改为 schema `z.infer` 转发，schema 成为唯一事实源。新增漂移钉死测试：逐通道实调 handler（演示数据 + 真实入库路径），断言信封与 schema；新通道不进钉死集测试即红。`time:sync`（NTP）、`backup:pick`（原生对话框）与 `vault:unlock-saved`（safeStorage）豁免实调，分别由 syncTime 注入用例与 E2E 覆盖。
- CI expanded from a single check job to three: `check` (eslint + typecheck + unit tests), `e2e` (all Electron E2E under xvfb on ubuntu; the packaged-app case self-skips without an artifact), and `packaged` (macOS arm64 build then `test:packaged` native-ABI gate).
  CI 从单 job 扩为三个：`check`（eslint + typecheck + 单测）/ `e2e`（ubuntu + xvfb 跑全部 Electron E2E，打包产物用例无产物自动跳过）/ `packaged`（macOS arm64 出包后跑 `test:packaged` 原生 ABI 闸门）。
- Minimal eslint baseline (flat config, typescript-eslint recommended): zero findings after removing three dead imports; wired into CI as `pnpm lint`.
  最小 eslint 基线（flat config + typescript-eslint recommended）：清理三处死导入后全仓零告警，经 `pnpm lint` 接入 CI。
- `syncTime` unit coverage via injected `offsetFn`: offset lands in record + `TIME_SYNC` entry; NTP-unreachable (null offset) throws and leaves no record or chain entry — closing the last untested service function.
  `syncTime` 单测（注入 `offsetFn`）：偏移入库入链；NTP 不可达（null 偏移）抛错且不落记录与链条目——服务层最后一个无测试函数补齐。

### Fixed
- The smoke E2E now asserts the pending list instead of scan counters: the inbox watcher may ingest the fixture before the manual scan, making the scan summary legitimately show `pending:0`.
  冒烟 E2E 改为断言待确认列表而非扫描统计：收件箱 watcher 可能在手动扫描前抢先入库，此时扫描统计合法地显示 `pending:0`。
- `clearMockData` deletion of sealed directories now meets the same path-containment fence as PIPL purge (checked before any deletion), closing a traversal gap where a corrupted DB row could delete outside `originals/`.
  `clearMockData` 删除封存目录补齐与 PIPL 清除同款的路径围栏（先校验后删除），封堵损坏行借路径穿越删到 `originals/` 之外的缺口。
- Inbox items the user explicitly rejected no longer resurrect as pending on the next scan; rejection is final for that path.
  被用户明确拒绝的收件项不再在下次扫描时复活为待办——拒绝对该路径是终局决定。
- Interview detail now lists only memos linked to that encounter's artifacts (previously the full library-wide memo list was returned on every detail page).
  访谈详情页只列出关联到该访谈采集物的备忘录（此前返回的是全馆备忘录列表）。

### Changed
- Renderer modularized (A38): the 1071-line `main.ts` is split into `ui.ts` (DOM/toast infrastructure), `ipc.ts` (`invoke`/`invokeQuiet`), `router.ts` (a view registry that breaks the main↔views cycle) and eight self-registering `views/*` modules; `main.ts` is now a 40-line startup assembly. Behavior-preserving refactor — all 142 unit tests and 7 E2E cases pass untouched.
  renderer 模块化拆分（A38）：1071 行 `main.ts` 拆为 `ui.ts`（DOM/toast 基础设施）、`ipc.ts`（invoke/invokeQuiet）、`router.ts`（视图注册表，解开 main↔views 循环）与八个自注册 `views/*` 模块；`main.ts` 收敛为 40 行启动装配。保持行为的重构——142 个单测与 7 条 E2E 原样通过。
- PIPL purge now reclaims freed space: after the purge transaction the WAL is checkpoint-truncated and the database is `VACUUM`ed, so deleted rows no longer linger in free pages of a copied vault file. This is still application-layer deletion — SSD wear leveling, filesystem snapshots and old backups may retain bytes (documented as threat-model residual risk §5.11).
  PIPL 清除补齐空间回收：清除事务后执行 WAL checkpoint(TRUNCATE) + `VACUUM`，已删行不再残留于库文件空闲页。这仍是应用层删除——SSD 磨损均衡、文件系统快照与旧备份可能保留字节（威胁模型 §5.11 已记录为残余风险）。
- Backup container upgraded to **OFBK2**: KDF parameters (scrypt N=2^17, r=8, p=1) are stored explicitly in the header with reader-side sanity clamps; legacy OFBK1 containers remain permanently readable; export now writes atomically via temp+rename so a crash cannot leave a half-written file blocking retries.
  备份容器升级为 **OFBK2**：KDF 参数（scrypt N=2^17、r=8、p=1）显式写入容器头并带读取侧夹限；旧 OFBK1 容器永久可读；导出改为临时文件 + rename 原子落位，崩溃不再留下阻塞重试的半截文件。
- External links opened from the app are now restricted to a host allowlist (project site + GitHub) instead of any https URL.
  应用内打开的外链由「任意 https」收紧为主机白名单（项目官网 + GitHub）。
- Renderer no longer hand-copies entity interfaces: UI payload types live in `shared/types.ts` and entity types are imported from `@openfield/core`, eliminating drift as entities evolve.
  renderer 不再手工复制实体 interface：UI 载荷类型收敛至 `shared/types.ts`，实体类型直接取自 `@openfield/core`，实体演进不再产生类型漂移。

### Added
- 研究台 (Research Desk) fuses the field workbench with the research layer on desktop: memos (速记/反身性/分析) gain thematic coding (`themes`, migration v3) whose writes are themselves recorded on the evidence chain (new `MEMO_CODE` action); a theme map with per-theme counts and click-to-filter puts single-source themes forward as triangulation gaps; the event-chain timeline rebuilds the field site from real workbench records (events → encounters → artifacts → memos) and every memo row links back through its artifacts into the archive's encounter detail; the 报道档案深读 five-field coding template (时间/地点/主体/行动/回应) is a one-click scaffold, with the method card embedded at the coding workbench. Demo-dataset memos ship with sample codings.
  研究台（Research Desk）：把田野工作台与研究层在桌面端打通——备忘录（速记/反身性/分析）支持主题编码（`themes`，迁移 v3），撰写与编码本身均入证据链（新增 `MEMO_CODE` 动作）；主题图谱按主题计数、点击筛选，孤证主题即三角验证缺口；事件链时间轴用工作台真实记录（事件 → 访谈 → 采集物 → 备忘录）还原田野现场，备忘录行经关联采集物一键跳回档案库对应访谈详情；「报道档案深读」五字段编码模板（时间/地点/主体/行动/回应）一键成稿，方法卡片嵌入编码台。演示数据备忘录自带示例编码。
- Focus-Interview-derived methodology chapter (`docs/社会学田野/05-中国/焦点访谈田野方法论.md`): "from Focus Interview to the field" — three depth perspectives on using broadcast archives as fieldwork material (event-chain reconstruction, three-decade topic comparison, power-structure "who is present/absent" analysis), the four biases of media archives and their corrections, and a six-step deep-reading workflow; cross-linked to the episode catalog and the triangulation framework. A ninth method card (报道档案深读， practice-graded) now surfaces the workflow on both the desktop methodology view and the web Home.
  焦点访谈衍生方法论章节（docs/社会学田野/05-中国/焦点访谈田野方法论.md）：「从《焦点访谈》到田野」——报道档案作为田野素材的三个深度视角（事件链还原、三十年议题纵向比较、权力结构"谁在场"分析）、媒体档案四类偏差与矫正、六步档案深读工作流；与节目目录章和三角验证框架互相链接。新增第九张方法卡（报道档案深读，操作性建议级），桌面端方法论视图与 web 首页同步呈现。
- 《焦点访谈》农村困境报道 theme chapter (`docs/社会学田野/05-中国/焦点访谈农村困境报道.md`): an indexed catalog of 23 classic CCTV Focus Interview episodes on rural predicaments — taxes and burdens (1998–2012), agricultural policy and industry (2000–2014), migrant workers' rights (2007–2013), land and urbanization (1994–2017) — each with location/content/impact notes graded 【通行共识】 (premiere facts graded 【核验】), plus fieldwork guidance on turning broadcast archives into research material (triangulation, evidence boundaries, import & citation practice) and a retrieval-and-references appendix. Both apps pick it up through the shared knowledge dist (now 44 chapters, 423 evidence markers).
  《焦点访谈》农村困境报道主题章节（docs/社会学田野/05-中国/焦点访谈农村困境报道.md）：按四大主题编目 23 期《焦点访谈》经典报道——农民负担与税费（1998–2012）、农业政策与产业困境（2000–2014）、农民工权益与人身自由（2007–2013）、土地与城镇化（1994–2017）——每期附地点/内容/影响并以【通行共识】定级（栏目开播等事实为【核验】），并给出把报道档案变成田野研究素材的用法（三角验证、证据边界、入库与引用）以及检索途径与参考文献。双端经共享 knowledge dist 自动同步（现为 44 章、423 处证据标记）。
- Web Home method-cards section: the full method-card strip (evidence badge, points, and a deep link into the source chapter including anchor jumps) now renders on the web landing page, closing the last knowledge-feature gap with the desktop methodology view.
  Web 首页新增方法卡区：全量方法卡（证据徽章、要点、以及可带锚点跳转的章节深链）现已在 web 落地页呈现，补齐与桌面端方法论视图的最后一处功能差。
- Fieldwork knowledge integration: `packages/knowledge` (`@openfield/knowledge`) converts the two methodology corpora (`docs/田野方法/`, `docs/社会学田野/` — 42 chapters, 393 evidence-graded markers) at build time into pre-generated HTML, a manifest (chapter meta, outlines, evidence counts, 4 learning paths, 5 method cards), and per-section search text; output is committed under `dist/` and gated by a build-time safety assertion (no `<script`, no `javascript:`); unresolvable doc links degrade to plain text so source files stay untouched.
  田野知识库集成：`packages/knowledge` 在构建期把两套方法论语料库（`docs/田野方法/`、`docs/社会学田野/`，42 章、393 处证据分级标记）转换为预生成 HTML、manifest（章节元数据/大纲/证据计数/4 条学习路径/5 张场景卡）与逐节搜索文本；产物提交入库并以构建期安全断言把关（无 `<script`、无 `javascript:`）；解析不到的文档链接降级为纯文本，源文件保持不动。
- `apps/web` (`@openfield/web`): a knowledge-base web app (Vite + React + HashRouter) serving the two collections offline-statically — collection browsing with sticky in-chapter outlines, client-side full-text search, glossary pages, evidence-badge legend, and learning-path entries. It ships knowledge content only: no vault, no participant data, no backend.
  `apps/web` 知识库 Web App（Vite + React + HashRouter）：离线静态承载两套合集——章节浏览 + 吸顶节内大纲、客户端全文搜索、术语表页、证据徽章图例与学习路径入口。仅含知识内容：无资料库、无受访者数据、无后端。
- Desktop "方法论" (methodology) view: chapter tree with filter, in-chapter outline navigation, evidence-graded badges, and cross-chapter links — available in locked state (static content, no IPC). Three contextual method cards embedded at the point of work: interview guide & consent ethics in registration, memo coding in the archive memo column, plus a full five-card strip in the methodology view.
  桌面端「方法论」视图：章节树（可筛选）、节内大纲导航、证据分级徽章与跨章节跳转——锁定态即可用（纯静态内容，不经过 IPC）。三张上下文方法卡片嵌入工作现场：登记页的访谈提纲与知情同意、档案库备忘录栏的主题编码，另在方法论视图内提供全量五张卡片。
- Backup restore UI: locked-state entry in the workbench plus a new `backup:pick` IPC channel (native file dialog, path never leaves the main process); three-passphrase restore form with front-end validation and centralized error-copy mapping (`restoreErrorText`). `vaultPassphrase` is the original-vault confirmation — the container's DB keeps the source SQLCipher key, so the restored vault unlocks with the original passphrase (A29; matches the A22 closed-loop semantics).
  备份恢复界面：工作台锁定态入口 + 新增 `backup:pick` IPC 通道（原生文件对话框，路径不出主进程）；三口令恢复表单带前端校验，错误文案集中映射（`restoreErrorText`）。`vaultPassphrase` 为原库口令确认——容器内库保留源库 SQLCipher 密钥，恢复出的资料库仍用原口令解锁（A29；与 A22 闭环语义一致）。
- macOS packaging pipeline (electron-builder): unsigned (ad-hoc) arm64 DMG + zip via `pnpm dist`, unpacked-app gate via `pnpm test:packaged` (Playwright launches the packaged binary — the native-ABI sentinel), and a cobalt app icon. `@electron/get` pinned to 5.1.0 workspace-wide (A27: app-builder-lib 26.15.3 declares ^3.0.0 but uses the 5.x-only `ElectronDownloadCacheMode`).
  macOS 打包链路（electron-builder）：`pnpm dist` 产出无签名（ad-hoc）arm64 DMG + zip；`pnpm test:packaged` 以打包产物跑冒烟（native ABI 哨兵）；新增电钴蓝应用图标。workspace 级钉住 `@electron/get` 5.1.0（A27：app-builder-lib 26.15.3 声明 ^3.0.0 却使用仅 5.x 存在的 `ElectronDownloadCacheMode`）。
- Backup restore closed loop: `restoreBackup` decrypts an OFBK container, rewrites stored absolute `original_path` values to the new home, re-seals originals read-only, and lands `vault.db` atomically last; new `backup:restore` IPC channel (locked-state only, refuses to overwrite an existing vault); closed-loop test reopens the restored vault and runs full verification clean.
  备份恢复闭环：`restoreBackup` 解密容器、把库内绝对路径 `original_path` 重写到新家、恢复原始件只读封存、`vault.db` 最后原子落位；新增 `backup:restore` IPC 通道（仅锁定状态可用、拒绝覆盖已有资料库）；闭环测试验证「恢复出的库可重开且校验零问题」。
- External chain-head anchor (`chain-anchor.json`): verification now seeds/refreshes an out-of-database anchor of the last verified chain head, so tail truncation of the evidence log — internally self-consistent, invisible to chain replay alone — is detected and reported (`anchor-mismatch`); a corrupted anchor is reported and never silently rewritten. Discharges the obligation recorded at the Plan 1 final review; limitation (resettable by a disk-level adversary) documented in the threat model.
  链头外置锚点（`chain-anchor.json`）：校验通过后写入/刷新库外锚点，链尾截断（内部自洽、链重放检不出）由此可检出并报告 `anchor-mismatch`；锚点损坏只报告不覆写。兑现 Plan 1 终审遗留义务；局限（磁盘级对手可重置）已记入威胁模型。

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
- Documentary knowledge corpus (`docs/纪录片/`): 17 chapters / 98 documents (~610k characters) for solo non-fiction video work — theory, history, film language, sound, narrative, interviewing, field shooting, editing & post, tech & gear, ethics & law, production & funding, distribution, cases, the fieldwork×image interface chapter, tools & templates, and learning resources. Written for a reader who can do fieldwork but has no film training and works alone; every document carries evidence grades and a 实操要点 checklist. Ch. 14 is the only fieldwork-overlap chapter — the rest cross-link to `docs/田野方法/` and `docs/社会学田野/` instead of restating them. Indexed from `docs/README.md`; **not** wired into `packages/knowledge`, and the corpus has not been through the adversarial re-verification the two methodology corpora did, so 【核验】 claims are scarce and 【通行共识】 is the highest-risk tier (stated at the entry point).
  纪录片语料库（docs/纪录片/）：17 章 98 篇、约 61 万字符的单人非虚构影像知识库——理论、历史、电影语言、声音、叙事、采访、拍摄执行、剪辑后期、技术设备、伦理法律、生产资金、发行传播、案例、田野×影像交叉章、工具模板与学习资源。预设读者会做田野但没受过影像训练、且一个人干活；每篇带证据分级与「实操要点」清单。第 14 章是唯一与田野重叠的章，其余一律交叉链接到 `docs/田野方法/` 与 `docs/社会学田野/` 而不重述。已挂入 `docs/README.md` 索引；**未**接入 `packages/knowledge`，且本库未走方法论语料库那套对抗式复核，【核验】级条目很少、【通行共识】是风险最高的一档（入口已明示）。

### Fixed
- RefId sequence allocation is now monotonic and never reused: a new `ref_sequences` table (migration v2, backfilled from existing `ref_id` values) issues citation numbers, and PIPL purge no longer causes either a permanent `UNIQUE constraint` block (previously: re-issuing after purging a lower-published number retried forever) or reuse of an already-published number (previously: purging the highest number rolled the counter back). Regression tests cover both scenarios.
  RefId 序号改为单调分配、永不复用：新增 `ref_sequences` 表（迁移 v2，从既有 ref_id 回填）签发引用序号；PIPL 清除后不再出现永久性唯一索引冲突（此前清除低序号后重新签发会“重试”致死）或复用已发表引用号（此前清除最高序号后计数回退）。两个场景均有回归测试。
- `inbox:list` IPC input now validates `status` against the `InboxStatus` enum (previously any string passed through to the SQL query).
  `inbox:list` 的 `status` 入参改为 InboxStatus 枚举校验（此前任意字符串均可透传到 SQL 查询）。
- Bundle mediaRef de-duplication now updates the seen-set inside the loop, so duplicate filenames within one bundle produce a single inbox item (matching the documented intent).
  bundle 媒体引用去重改为循环内同步更新集合：同一 bundle 内重复 filename 现在只落一条收件项（与注释声明的行为一致）。
