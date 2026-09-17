# OpenField Principles

**Grounding AI in Human Reality.**
**让 AI 扎根于人的真实经验。**

OpenField is a fieldwork operating system for the AI era — built to be carried across all of China, into factories, villages, markets, and workshops, to talk with people from every walk of life, and to preserve what they say with evidentiary rigor and academic integrity.

OpenField 是一套面向 AI 时代的田野调查操作系统。它被设计为可以随身携带、走遍中国——走进工厂、村庄、市场与作坊，与各行各业的人交谈，并以证据级的严谨性和学术诚信，保存他们所说的每一句话。

This document is the constitution of the project. Every architectural decision, every PR, and every roadmap item is evaluated against it. When principles conflict with velocity, principles win.

本文档是项目的宪法。所有架构决策、代码评审与路线图取舍，均以此为准绳。当原则与开发速度冲突时，原则优先。

---

## 1. What OpenField Is

**A Fieldwork OS, not a chatbot.**
OpenField is the researcher's capture terminal, evidence vault, field archive, and methodological enforcement engine. It exists to produce defensible research artifacts — not conversations.

**田野操作系统，而非聊天机器人。**
OpenField 是研究者的采集终端、证据库、田野档案与方法论执行引擎。它存在的意义是产出经得起质疑的研究成果——而不是对话。

**An AI coworker, not an oracle.**
Every AI output is a proposal awaiting human confirmation. AI augments fieldwork; it never replaces human judgment, empathy, or presence in the field.

**AI 是同事，不是先知。**
所有 AI 输出都是等待研究者确认的提案。AI 增强田野工作，但绝不替代人在现场的判断、共情与在场本身。

---

## 2. The Six Non-Negotiables

### 2.1 Chain of Custody（证据链，不可篡改）

Every artifact is frozen at capture: SHA-256 hash, trusted timestamp, GPS coordinates, and device fingerprint are written to an append-only evidence log the moment a recording, photo, or note is saved. Originals are never modified — editing creates a new version. Every artifact carries a permanent, citable ID.

学术严谨性的根基。每份采集物在生成瞬间即固化：SHA-256 哈希、可信时间戳、GPS 坐标与设备指纹写入仅可追加的证据日志。原始文件永不覆盖，编辑只产生新版本。每份材料拥有永久可引用的编号，论文中可精确引用至某段录音的某一秒。

> ❌ **Never:** silently overwrite, re-encode, or "clean up" original files.
> ❌ **禁止：**静默覆盖、重编码或"顺手清理"原始文件。

### 2.2 Offline-First（离线优先，为在路上而生）

The field has no signal — county towns, mountains, basement markets. All core functionality works fully offline; sync is incremental and opt-in. Cold start to first capture: ≤ 3 taps. Moments in the field are fleeting; software must not waste them.

田野现场没有信号。全部核心功能必须断网可用，联网仅做增量同步且需用户主动授权。从掏出设备到开始采集不超过 3 步操作——现场转瞬即逝，软件不许浪费它。

### 2.3 Rigorous for the Researcher, Invisible to the Participant（对研究者严谨，对受访者无感）

Evidentiary rigor must never become interpersonal friction. Consent flows should feel like conversation; hash freezing happens silently in the background. If a participant notices the machinery, the machinery has failed.

取证流程不能让受访者紧张。知情同意要像聊天一样自然，哈希固化在后台静默完成。如果受访者察觉到了这套机制的存在，说明这套机制失败了。

### 2.4 Ethics & Compliance as Infrastructure（伦理即基础设施）

- Informed consent is versioned, stored, and revocable — recorded before capture, never after.
- Real names are encrypted at rest; the analysis layer sees pseudonyms by default.
- Full PIPL compliance: a participant's "right to be forgotten" triggers complete, auditable erasure across the entire chain.
- No scraping, no surveillance, no covert collection. Ever.

- 知情同意先于采集发生，有版本、可存证、可撤回。
- 真名静态加密存储，分析层默认只见化名。
- 全面符合《个人信息保护法》：受访者行使删除权时，其数据在全链路可审计地彻底清除。
- 永不支持爬虫抓取、监控式采集或隐蔽取证。

### 2.5 Sedimentation, Not Storage（沉淀，而非堆积）

Raw data is not knowledge. Every artifact must flow into a knowledge base indexed by four dimensions — **people × place × time × theme** — with auto-generated daily field journals, referral-chain graphs (snowball sampling as evidence), and analytic memos that trace AI drafts to human confirmation.

原始数据不等于知识。所有采集物必须汇入四维索引的知识库——**人物 × 地点 × 时间 × 主题**——自动生成每日田野日志，可视化引荐链条（滚雪球抽样本身即证据），并让分析备忘录完整记录"AI 草稿 → 人工确认"的轨迹。

### 2.6 Academic-Grade Output（学术级交付）

Export to REFI-QDA (NVivo/MAXQDA interoperability), standard citation formats with verifiable evidence hashes, and Zotero integration. If an artifact cannot survive peer review scrutiny, it is not done.

支持 REFI-QDA 导出（与 NVivo/MAXQDA 互通）、含可验证证据哈希的标准学术引用格式、Zotero 对接。任何产出若经不起同行评审的审视，就不算完成。

---

## 3. Engineering Standards（工程标准）

| Standard | Requirement | 要求 |
| --- | --- | --- |
| Local-first storage | Encrypted local DB (SQLCipher-class); cloud sync E2E-encrypted and opt-in | 本地加密数据库；云端同步端到端加密且默认关闭 |
| Open formats | Markdown, JSON-LD, CSV, REFI-QDA. No proprietary lock-in | 开放格式，拒绝私有锁定 |
| Model-agnostic safety | Ethics checks, privacy filters, and methodological validation are middleware — they survive any LLM swap | 伦理与隐私校验独立于模型，换模型不换底线 |
| Confirm before acting | Any AI-driven or destructive operation: preview → explicit confirmation → reversible execution → full audit log | AI 或破坏性操作必须：预览 → 显式确认 → 可回滚 → 留痕 |
| Remote wipe | Device-loss protection ships in MVP, not later | 设备丢失的远程擦除能力属于 MVP，不许后置 |

---

## 4. Bilingual Convention（双语规范）

| Dimension | English | 中文 |
| --- | --- | --- |
| Terminology | Standard qualitative research vocabulary (reflexivity, triangulation, thick description) | 学界通用译法（反身性、三角验证、厚描），首次出现括注英文 |
| UI copy | Native, concise, action-oriented | 地道学术中文，无翻译腔，拒绝互联网黑话 |
| Code & API | English only: field names, endpoints, filenames | 代码层一律英文 |
| Language phasing | P1 is Chinese-first — product, docs, and published content. English is deferred, not dropped: every deferred translation is logged as tracked debt. | P1 中文先行——产品、文档、发布内容皆以中文为准。英文是推迟，不是放弃：每笔翻译债记录在案、逐项跟踪。 |
| Published content | Chinese-first through P1 (dev logs, demos, field videos); English-narrated versions for YouTube / Twitter begin with international expansion | P1 发布内容（开发日志、演示、田野视频）中文先行；国际化启动后为 YouTube / Twitter 制作英文口播版本 |
| User-facing | Help docs, errors, onboarding ship in both languages simultaneously (enforced from international launch) | 帮助文档、报错、引导必须双语同步发布（自国际化启动起强制） |
| Parity rule | No feature or published item is done until both languages are done — enforced from international launch. | 双语不对等的功能与发布内容视为未完成——自国际化启动起强制执行。 |

---

## 5. Quality Benchmarks（质量基准，对标 OpenWorker）

- **Task Completion Rate** — % of initiated field tasks that yield a usable artifact. Tracked via opt-in telemetry and periodic user interviews.
  田野任务完成率：发起的任务最终产出可用成果的比例。
- **Confirmation Compliance** — Executing a sensitive action without recorded confirmation is a P0 bug. CI covers every confirmation path.
  未经确认即执行敏感操作 = P0 级缺陷，CI 全覆盖。
- **Artifact Validity** — Generated codebooks pass a methodological validator (code mutual exclusivity, hierarchy integrity) in CI.
  编码表需通过方法论规则引擎校验方可合入。
- **The Founder's Field Rule** — Every release should survive real fieldwork. The maintainer is expected to carry it into the field each release cycle — a norm, not a gate: if unmet, the release may still ship, flagged as not yet field-validated.
  创始人田野法则：每个版本都应经受真实田野的检验。维护者应尽量在每个发布周期内带它完成一次真实田野——这是倡导，不是门槛：未完成时版本仍可发布，但需标注"尚未经田野验证"。

---

## 6. Non-Goals（明确不做的事）

- ❌ A generic note-taking app / 通用笔记应用
- ❌ Automated analysis without human confirmation / 无人工确认的自动分析
- ❌ Cloud-dependent core features / 依赖云端的核心功能
- ❌ Growth hacking on participant data / 利用受访者数据做增长
- ❌ Replacing IRB or institutional ethics review / 替代机构伦理审查

---

## 7. For Contributors（致贡献者）

Every PR touching data handling, AI integration, or user-facing copy must pass the [Ethics Self-Review Checklist](docs/工程/伦理自查.md) and be checked against Section 2. When in doubt, open an issue citing the principle at stake — debating principles is welcome; silently violating them is not.

任何涉及数据处理、AI 集成或用户可见文案的 PR，必须通过[伦理自查清单](docs/工程/伦理自查.md)，并对照第 2 节逐条检查。有疑问时，欢迎开 issue 引用相关原则讨论——我们欢迎对原则的辩论，但不接受对原则的无声违背。

---

*"The field is where theory meets reality. OpenField exists to make sure reality keeps its receipts."*

「田野是理论遇见现实的地方。OpenField 的使命，是让现实留下可查证的回执。」
