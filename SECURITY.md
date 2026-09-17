# Security Policy

**安全策略**

OpenField holds evidentiary fieldwork data: recordings, transcripts, consent records, and real identities behind pseudonyms. A flaw here is not a bug report — it is a betrayal of the people in the vault.
OpenField 存放的是证据级田野数据：录音、转写、同意书，以及化名背后的真实身份。此处的缺陷不是普通 bug——是对资料库中每一个人的辜负。

> As-built mitigations, the adversary model, and an honest list of residual risks live in the [Threat Model](docs/工程/威胁模型.md); implementation details in the [Architecture](docs/工程/架构.md).
> 已实现的缓解措施、对手模型与残余风险的诚实清单见[威胁模型](docs/工程/威胁模型.md)；技术实现细节见[架构文档](docs/工程/架构.md)。

## Reporting（报告渠道）

Use **GitHub Private Vulnerability Reporting** (repository Security tab → "Report a vulnerability"), or contact the maintainer [@allengaller](https://github.com/allengaller) directly.
请使用 **GitHub 私密漏洞报告**（仓库 Security 页 → "Report a vulnerability"），或直接联系维护者 [@allengaller](https://github.com/allengaller)。

Please include: affected component, reproduction steps, impact assessment, and — most importantly — whether participant data could be exposed.
请附：受影响组件、复现步骤、影响评估，以及最关键的一点——受访者数据是否可能泄露。

We aim to acknowledge within 3 business days and will keep you informed through coordinated disclosure. Reporters are credited by default; anonymity on request.
目标 3 个工作日内确认，并以协同披露方式与你保持同步；默认致谢报告者，可要求匿名。

## What We Care About Most（最高优先级）

- **Participant data exposure 受访者数据泄露** — plaintext identifiers; pseudonym mappings reaching logs, exports, or AI calls; encryption weakened anywhere in the chain.
  明文标识符；化名映射进入日志、导出物或 AI 调用；链路中任何一处加密被削弱。
- **Consent bypass 同意绕过** — any capture path that can run before a consent record exists; covert capture in any form.
  任何先于同意记录的采集路径；任何形式的隐蔽采集。
- **Erasure failure 清除失效** — right-to-be-forgotten leaving recoverable traces, or destroying the audit trail of the erasure itself.
  删除权行使后仍有可恢复痕迹，或破坏了"清除行为本身"的审计痕迹。
- **Evidence tampering 证据篡改** — any path that overwrites, re-encodes, or reorders the append-only evidence log; hash verification bypasses.
  任何覆盖、重编码或重排仅可追加证据日志的路径；哈希校验被绕过。
- **Confirmation bypass 确认绕过** — sensitive actions executing without recorded confirmation. Defined as P0 in PRINCIPLES.md §5.
  未经记录确认即执行敏感操作。PRINCIPLES.md 第 5 节定义为 P0。
- **Sync violations 同步违规** — uploads without explicit opt-in.
  未经用户主动授权的上传。

## Rules of Engagement（测试边界）

- Test only against systems you own or synthetic data. 只对你拥有的系统或合成数据做测试。
- Never include real participant data in a report — describe, don't possess.
  报告中绝不包含真实受访者数据——请描述，而非持有。

## Fixes & Disclosure（修复与披露）

Security fixes land on `main` and ship in the next release. Participant-data-impacting fixes are called out in the changelog and release notes, with an evidence-level explanation of what was at risk and how it was closed.
安全修复进入 `main` 并随下一个版本发布。凡影响受访者数据的修复，都会在变更日志与发布说明中明确标注——以证据级的严谨说明风险是什么、如何封堵。
