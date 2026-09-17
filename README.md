<div align="center">

# OpenField

**Grounding AI in Human Reality · 让 AI 扎根于人的真实经验**

一套单人可携带的田野调查操作系统（Fieldwork OS）——采集、存证、沉淀、分析、交付，
全程离线优先，证据级严谨，伦理即基础设施。

[![CI](https://github.com/allengaller/open-field/actions/workflows/ci.yml/badge.svg)](https://github.com/allengaller/open-field/actions/workflows/ci.yml)

**[宪法 Principles](PRINCIPLES.md)** · **[田野行动总纲](docs/研究/行动总纲.md)** · **[方法论语料库](docs/田野方法/README.md)** · **[伦理自查清单](docs/工程/伦理自查.md)** · **[参与贡献](CONTRIBUTING.md)** · **[官网](https://jvvil0otgnr4.meoo.fun)**

</div>

---

## 这是什么

OpenField 不是「AI 聊天助手」，也不是又一个笔记软件。它被设计为可以背着走遍中国的田野作业系统：走进工厂、村庄、市场与作坊，与各行各业的人交谈，并以**证据级的严谨性和学术诚信**保存他们所说的每一句话。

它是研究者的四件套：

| 角色 | 说明 |
| --- | --- |
| 采集终端 Capture Terminal | 录音、照片、笔记、文档的多模态入口，断网完整可用 |
| 证据库 Evidence Vault | 哈希链 + 只读封存 + 可信时间，让每份材料经得起质疑 |
| 田野档案 Field Archive | 人物 × 地点 × 时间 × 主题的知识沉淀，而不只是堆积 |
| 方法论引擎 Methodology Engine | 知情同意、匿名化、三角验证等研究方法被固化为系统能力 |

**AI 是同事，不是先知。** 所有 AI 输出都是等待研究者确认的提案（P1 阶段刻意不接 AI）；AI 增强田野工作，绝不替代人在现场的判断、共情与在场本身。

> 当原则与开发速度冲突时，原则优先——所有架构决策均以 [PRINCIPLES.md](PRINCIPLES.md)（项目宪法）为准绳。

## 当前状态

P1（能出门干活）开发中。**桌面端服务层与完整工作台界面均有单元测试与 E2E 覆盖（含演示数据全流程）；移动端与 AI 能力尚未开始。**

| 模块 | 状态 |
| --- | --- |
| [`packages/core`](packages/core) — 数据模型 / 哈希链 / 引用 ID / bundle 协议 | ✅ 已交付，单测覆盖 |
| [`apps/desktop`](apps/desktop) — Electron 服务层（加密库 / 导入 / 校验 / 引用 / 清除 / 备份） | ✅ 已交付，单测 + Playwright E2E |
| 桌面 UI | ✅ 工作台五视图 + 访谈详情 + 演示数据 + PIPL 危险区 + 知情同意管理；备份还原界面推进中 |
| `apps/mobile` — 手机轻薄端（encounter 记录 / 同意存证 / 速记 → bundle） | ⬜ Plan 3 |
| AI 能力（编码提案、转写、反身性提醒） | ⬜ P2/P3，P1 刻意不接 AI |

> **30 秒上手**：`pnpm install && cd apps/desktop && pnpm dev`，创建资料库后到「总览」点「载入演示数据」即可体验全部功能（详细操作见 [docs/工程/使用手册.md](docs/工程/使用手册.md)）。

## 五层架构

```
┌─────────────────────────────────────────────────────────┐
│  L5 输出层   学术引用 · 加密备份 · （P3）REFI-QDA 导出      │ ← 引用/备份已实现
├─────────────────────────────────────────────────────────┤
│  L4 分析层   （P3）AI 编码提案 · 三角验证 · 反身性提醒      │ ← 每日日志草稿已实现
├─────────────────────────────────────────────────────────┤
│  L3 沉淀层   （P2）四维索引知识库 · 引荐链图谱             │ ← 结构化登记已实现
├─────────────────────────────────────────────────────────┤
│  L2 取证层   哈希链 · 只读封存 · 可信时间 · append-only 日志 │ ← 已实现（核心壁垒）
├─────────────────────────────────────────────────────────┤
│  L1 采集层   Inbox 导入 · 事件/访谈登记 · （Plan 3）手机端  │ ← 桌面导入流已实现
└─────────────────────────────────────────────────────────┘
```

P1 的关键决策（详见[架构规格](docs/规格与计划/规格/2026-09-09-P1架构设计.md)）：

- **导入模式，不重造录音机**：手机录音 / 拍照经 iCloud 自然回流，桌面端的价值是证据链登记与结构化；
- **双端分工**：桌面全功能端 + 手机轻薄端，iCloud 只搬密文与已同意材料；
- **P1 无 AI**：外部转写文本作为一等公民导入，核心验证目标是证据链 + 数据模型跑通真实田野。

## 已实现能力

| 能力 | 说明 |
| --- | --- |
| 加密资料库 Vault | SQLCipher 整库加密（口令 ≥ 8 字符，**丢失无找回**）；WAL；带版本迁移 |
| 证据链 EvidenceLog | 仅可追加的链式哈希日志，由 SQLite 触发器在库层拒绝 UPDATE/DELETE |
| 采集物封存 Ingest | SHA-256 → temp+rename 原子写入 → chmod 只读；封存后二次哈希校验；同哈希幂等去重；空文件 / iCloud 占位文件拒收 |
| 收件箱 Inbox | 监听导入目录自动发现文件；畸形 bundle 进隔离区，不污染主库 |
| 完整性校验 Verify | 全链重放 + 原始件逐一重算哈希 + 孤儿目录检测，出具完整性报告 |
| 引用 ID RefId | `OF-YYYYMMDD-CCC-NNN[#Tmm:ss]`，可精确引用到录音内某一秒；一经签发不可变更 |
| PIPL 删除权 Purge | 按化名级联清除该受访者全部文件与记录；显式确认令牌防误清；清除事实本身入链留痕 |
| 可信时间 TimeSync | NTP 校时，时钟偏移以 `TIME_SYNC` 入链——「采集时刻被改过」事后可检出 |
| 加密备份 Export | OFBK1 容器（scrypt + AES-256-GCM）打包加密库副本与全部原始件 |
| 每日田野日志 | 自动聚合当日事件 / 访谈 / 采集物为草稿 Memo，人工补写反思、确认后 `MEMO_CONFIRM` 入链 |
| 链日志查看 | 证据链页逐条显示全部链条目（序号 / 时间 / 动作 / 操作者 / 哈希前缀）——「未被修改过」可随时自证 |
| 受访者建档 + 知情同意 | 引荐链（滚雪球抽样证据）与同意范围、撤回状态界面录入，`CREATE_PARTICIPANT` / `CONSENT_RECORDED` 均入链 |
| 演示数据 Demo | 一套可编辑示例田野数据（事件/受访者/访谈/采集物/同意书/备忘录/待办），一键载入与清除，全部走真实入库路径 |
| 知情同意 Consent | 记录/撤回均入链（`CONSENT_RECORDED` / `CONSENT_WITHDRAW`）；**引用门禁**：audio 需未撤回的录音同意、photo 需未撤回的肖像同意，否则不可签发引用 |
| 匿名化 | 真名仅存独立表 `participant_identity`，分析层默认不 JOIN；core 类型层面直接拒绝 `real_name` 字段 |

### 证据链格式

```
entry_hash = SHA-256(seq | prev_hash | ts | actor | action | payload_hash)

seq          全链单调递增，首条 prev_hash 为 64 个 '0'
action       INGEST_ARTIFACT · CREATE_EVENT · CREATE_ENCOUNTER · CREATE_PARTICIPANT
             · CONSENT_RECORDED · CREATE_MEMO · MEMO_CONFIRM · EXPORT · TIME_SYNC
             · PURGE_SUBJECT（只记录删除事实与范围，不含已删内容）
```

任何对历史记录的篡改都会导致后续所有 `entry_hash` 校验失败；`verify:run` 重放全链即可检出。

### 数据模型

README 六实体全保留，P1 新增三个：

| 实体 | 说明 |
| --- | --- |
| `FieldEvent` | 一次田野活动：日期、城市码、地点、GPS、情境笔记 |
| `Encounter` | 一次交流/访谈：所属事件、受访者引用、**为何选 TA**（抽样逻辑本身即研究资料）、同意记录 |
| `Artifact` | 采集物（audio/photo/note/doc/transcript）：SHA-256、大小、MIME、采集时间、GPS、设备、版本、引用 ID |
| `Participant` | 受访者档案（仅化名）：行业、地区、引荐链、同意范围 |
| `ConsentRecord` | 知情同意：模板类型（录音/肖像/发表范围）、签名/口头同意 Artifact、范围、撤回标记 |
| `Memo` | 备忘录：关联采集物、类型（反身性/分析/每日/速记）、人工确认时间 |
| `InboxItem` | 导入暂存：待人工确认归属后才正式入库 |
| `TimeSyncRecord` | NTP 校验记录（同时入链） |
| `EvidenceEntry` | 证据链条目（append-only） |

## 快速开始

```bash
# 环境要求：Node ≥ 22，pnpm 11
corepack enable
pnpm install

pnpm test          # 全部单元 / 集成测试
pnpm typecheck     # TypeScript 严格模式检查

cd apps/desktop
pnpm dev           # 启动桌面应用
pnpm e2e           # Playwright Electron 冒烟：建库 → 登记 → 导入 → 引用
```

首次启动先输入口令（≥ 8 字符）创建资料库，**口令丢失无找回**。想先看功能：创建后到「总览 → 演示数据」点「载入演示数据」，一套示例田野（含滚雪球引荐链、已签发引用、待办收件）即可体验全部功能，内容可编辑（`apps/desktop/src/main/services/mock-data.ts`）。

数据目录默认位于系统用户数据目录（Electron userData），开发与测试可用 `--openfield-home=<path>` 显式指定：

```
<home>/
├─ vault.db        # SQLCipher 加密资料库
├─ originals/      # 原始件只读封存 originals/<artifactId>/v1.<ext>
├─ inbox/          # 导入暂存（监听目录，可指向 iCloud 同步目录）
├─ quarantine/     # 畸形 bundle 隔离区
└─ backups/        # OFBK1 加密备份输出
```

### 仓库结构

```
open-field/
├─ packages/core/          # @openfield/core：zod 数据模型、哈希链、RefId、bundle 协议（无 UI 依赖）
├─ apps/desktop/           # @openfield/desktop：Electron 主进程服务层 + 工作台 renderer（五视图）
├─ docs/                   # 全部文档入口见 docs/README.md
│  ├─ 工程/                # 架构 / 威胁模型 / 使用手册 / 伦理自查
│  ├─ 研究/                # 行动总纲 / 田野落点 / 路书
│  ├─ 田野方法/            # 田野调查方法论语料库（12 章 + 术语表 + 参考文献）
│  ├─ 社会学田野/          # 社会学田野知识库（15 章 + 实践指南）
│  └─ 规格与计划/          # 架构规格与实现计划（A 系列偏离记录）
├─ gtm/                    # Go-To-Market 计划（ICP / 定位 / 渠道 / 发布阶段 / 指标）
├─ website/                # 项目官网单页（已发布至 Meoo CDN）
├─ PRINCIPLES.md           # 项目宪法
└─ CONTRIBUTING.md · SECURITY.md · CHANGELOG.md · CITATION.cff · LICENSE
```

## 路线图

| 阶段 | 目标 | 内容 | 状态 |
| --- | --- | --- | --- |
| **P1**（0-3 月） | 能出门干活 | 桌面全功能端：加密库 + 证据链 + 导入流 + 引用 + PIPL 清除 + 加密备份；手机轻薄端出 bundle | 🚧 桌面服务层与完整工作台（含清除界面）完成；备份还原界面与手机端（Plan 3）推进中 |
| **P2**（3-6 月） | 能沉淀回溯 | 知识库四维索引、匿名化流水线、普通话转写接入、RFC3161 可信时间戳 | ⬜ |
| **P3**（6 月+） | 能严谨分析 | AI 编码提案（只提案、人工确认）、三角验证视图（孤证标记）、REFI-QDA 导出、反身性提醒 | ⬜ |

**P1 的铁律：先用自己的真实田野验证。** OpenField 的质量只能来自维护者背着它跑完第一个省——这是倡导而非门槛（见 PRINCIPLES §5 创始人田野法则）。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [docs/README.md](docs/README.md) | **全部文档索引**（按阅读目的导航） |
| [PRINCIPLES.md](PRINCIPLES.md) | 项目宪法：六条不可妥协项、工程标准、双语规范、质量基准 |
| [docs/工程/架构.md](docs/工程/架构.md) | As-built 架构：模块地图、vault schema、证据链协议、导入流、IPC 接口面、测试策略 |
| [docs/工程/使用手册.md](docs/工程/使用手册.md) | 桌面端使用手册：铁律、功能分步操作（含演示数据与 PIPL 危险区）、常见问题 |
| [docs/工程/威胁模型.md](docs/工程/威胁模型.md) | 威胁模型：资产、对手、缓解措施对照、残余风险诚实清单 |
| [docs/研究/行动总纲.md](docs/研究/行动总纲.md) | 田野行动总纲：商业模式、执行 SOP、与 OpenField 的需求映射 |
| [docs/田野方法/README.md](docs/田野方法/README.md) | 田野调查方法论语料库：面向 IT 从业者的完整中文知识库（12 章） |
| [docs/工程/伦理自查.md](docs/工程/伦理自查.md) | PR 伦理自查清单：数据处理 / AI / 文案类 PR 必须过检 |
| [gtm/README.md](gtm/README.md) | Go-To-Market 计划：ICP、定位与信息屋、渠道内容、四阶段发布、北极星指标、风险红线 |
| [docs/规格与计划/规格/](docs/规格与计划/规格/) | P1 架构设计规格（已确认） |
| [docs/规格与计划/计划/](docs/规格与计划/计划/) | 实现计划与评审偏离记录（A 系列决议） |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南：红线、流程、质量关卡、本地开发 |
| [SECURITY.md](SECURITY.md) | 安全策略：报告渠道与最高优先级问题 |
| [CHANGELOG.md](CHANGELOG.md) | 变更日志 |
| [CITATION.cff](CITATION.cff) | 论文引用元数据 |

## 两条核心设计张力

1. **敏感数据的物理安全**：走遍全国意味着设备丢失/检查风险。整库 SQLCipher 加密、真名映射仅存桌面 vault、原始件哈希封存，这些比任何 AI 功能优先级都高。
2. **「取证」与「信任」的张力**：过于正式的存证流程会让受访者紧张、说真话的意愿下降。设计上对研究者严谨、对受访者无感——同意流程像聊天一样自然，哈希固化在后台静默完成。

## 贡献

任何涉及**数据处理、AI 集成或用户可见文案**的 PR，必须通过[伦理自查清单](docs/工程/伦理自查.md)并对照 [PRINCIPLES 第 2 节](PRINCIPLES.md)逐条检查。**绝不提交真实田野数据**——测试夹具只允许合成数据。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证与引用

OpenField 以 [MIT 许可证](LICENSE)发布。在论文中引用请使用 [CITATION.cff](CITATION.cff) 元数据。

---

*"The field is where theory meets reality. OpenField exists to make sure reality keeps its receipts."*

「田野是理论遇见现实的地方。OpenField 的使命，是让现实留下可查证的回执。」
