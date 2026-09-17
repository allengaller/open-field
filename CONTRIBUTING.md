# Contributing to OpenField

**参与贡献**

> PRINCIPLES.md is the constitution of this project — read it before your first PR. When principles conflict with velocity, principles win.
> PRINCIPLES.md 是本项目的宪法——请在第一个 PR 之前通读。当原则与开发速度冲突时，原则优先。

## Before You Start（动手之前）

1. **Read the constitution 先读宪法** — especially the Six Non-Negotiables（第 2 节）.
2. **Search first 先检索** — existing issues and PRs may already cover your point.
3. **When in doubt, open an issue 有疑问先开 issue** — cite the clause at stake, using the Principle Discussion template. Debating principles is welcome; silently violating them is not.

## Issue Types（议题类型）

| Template 模板 | Use for 用途 |
| --- | --- |
| Bug Report 缺陷报告 | Behavior against the spec or the principles 行为不符合规范或原则 |
| Feature Proposal 功能提案 | Capabilities traced to a real field problem 从真实田野问题出发的能力 |
| Principle Discussion 原则讨论 | Debating or amending PRINCIPLES.md 宪法条款的辩论与修订 |

Feature proposals that touch data handling, AI, or participant-facing flows must state, in the proposal, which principles apply and how the design honors them.
涉及数据处理、AI 集成或受访者可见流程的功能提案，必须在提案中写明相关原则及设计如何满足它们。

## Data Safety（数据安全，红线）

- **Never commit real field data** — no recordings, photos, transcripts, participant identifiers, or consent records. Test fixtures use synthetic data only.
  **绝不提交真实田野数据**——录音、照片、转写、受访者标识符、同意书一律不得入库；测试夹具只允许合成数据。
- Never commit secrets: keys, tokens, signing material.
  密钥、令牌、签名材料同样禁止入库。

## Pull Requests（合并请求）

1. The PR template embeds the [Ethics Self-Review Checklist](docs/工程/伦理自查.md) — complete it before requesting review.
   PR 模板已内嵌[伦理自查清单](docs/工程/伦理自查.md)，请先自查再请求评审。
2. Any PR touching **data handling, AI integration, or user-facing copy** follows that checklist. Reviewers treat an unchecked applicable item as blocking; unsatisfiable §1–§3 items go to **Maintainer Ethics Review** — approval alone does not merge.
   涉及**数据处理、AI 集成或用户可见文案**的 PR 必须走该清单。适用项未勾选即阻断；第 1–3 节有无法满足的项时进入**维护者伦理评审**，仅 Approve 不合入。
3. **Bilingual parity 双语对等** — no feature is done until both languages are done（第 4 节）.
4. Keep PRs reviewable: small, single-purpose, with a clear principle reference.
   保持 PR 可评审：小而专注，原则引用明确。

## Quality Gates（质量关卡，第 5 节）

- Executing a sensitive action without recorded confirmation is a **P0 bug** — every confirmation path needs CI coverage.
  未经确认即执行敏感操作是 **P0 级缺陷**——确认路径必须有 CI 覆盖。
- Generated codebooks must pass the methodological validator.
  生成编码表必须通过方法论校验器。
- The Founder's Field Rule is a norm, not a gate: a release may ship without field validation, but it must be flagged as "not yet field-validated".
  创始人田野法则是倡导而非门槛：未经田野验证的版本仍可发布，但必须标注「尚未经田野验证」。

## Commits & Branches（提交与分支）

- Branches 分支：`feat/*`、`fix/*`、`docs/*`、`chore/*`
- Commits 提交：imperative mood, concise; bilingual summary welcome. 祈使句、简洁，欢迎双语概述。例如：`feat: version consent templates 版本化同意书`

## Local Development（本地开发）

Requirements 环境要求：Node ≥ 22、pnpm 11（`corepack enable`）。

```bash
pnpm install        # install all workspace packages 安装全部工作区依赖

pnpm test           # run all unit/integration tests 运行全部单元/集成测试
pnpm typecheck      # strict TypeScript check across the workspace 全仓严格类型检查

cd apps/desktop
pnpm dev            # launch the Electron app 启动桌面应用
pnpm e2e            # build, then Playwright Electron smoke 构建 + Electron 冒烟
```

Layout 代码结构：`packages/core` holds the pure-TS data model, hash chain, RefId, and bundle protocol (no UI dependencies); `apps/desktop` is the Electron app whose services live in `src/main/services/` as framework-free TS modules, tested directly in Node — the Electron shell is thin (`src/main/`). The [architecture doc](docs/工程/架构.md) is the as-built reference; update the matching section when you change service-layer behavior.
布局：`packages/core` 是纯 TS 的数据模型、哈希链、引用 ID 与 bundle 协议（无 UI 依赖）；`apps/desktop` 的服务层位于 `src/main/services/`，为框架无关的 TS 模块、在 Node 环境直接测试——Electron 只做薄壳（`src/main/`）。[架构文档](docs/工程/架构.md)是已实现现状的权威参照；改动服务层行为时请同步更新对应章节。

Invariants to respect when contributing 不变式：the evidence log is append-only (enforced by DB triggers), originals are sealed read-only via temp+rename, `real_name` may only enter the `participant_identity` table, and destructive operations require an explicit confirmation token. See [PRINCIPLES.md](PRINCIPLES.md) and the [architecture spec](docs/规格与计划/规格/2026-09-09-P1架构设计.md).
贡献时须遵守的不变式：证据日志仅可追加（数据库触发器强制）、原始件经 temp+rename 封存为只读、真名只允许进入 `participant_identity` 表、破坏性操作必须显式确认令牌。详见 [PRINCIPLES.md](PRINCIPLES.md) 与[架构规格](docs/规格与计划/规格/2026-09-09-P1架构设计.md)。

## Security & Conduct（安全与行为）

- Security problems never go in public issues — see [SECURITY.md](SECURITY.md).
  安全问题严禁公开发帖，见 [SECURITY.md](SECURITY.md)。
- Participation means agreeing to the [Code of Conduct](CODE_OF_CONDUCT.md).
  参与即表示同意[行为准则](CODE_OF_CONDUCT.md)。

## License（许可证）

OpenField is released under the [MIT License](LICENSE); contributions are licensed under the same license.
OpenField 以 [MIT 许可证](LICENSE)发布；贡献内容默认按同一许可证授权。
