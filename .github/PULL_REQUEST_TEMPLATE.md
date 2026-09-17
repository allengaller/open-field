<!--
Titles 命名: `<type>: <summary>` — types: feat | fix | docs | refactor | test | chore
Reviewers enforce docs/工程/伦理自查.md; an unchecked applicable item blocks merge.
评审者依据 docs/工程/伦理自查.md 把关；适用项未勾选即阻断合入。
-->

## What & Why 做了什么、为什么

<!-- One paragraph: the field/research problem this solves, and the principle that drove the design. -->
<!-- 一段话：解决什么田野/研究问题，设计由哪条原则驱动。 -->

**Principles at stake 相关原则：** PRINCIPLES.md §___

## Changes 变更点

-

## Ethics Self-Review 伦理自查

<!-- Source of truth: docs/工程/伦理自查.md. Check ✅, mark N/A with one line, or explain in the PR body. -->
<!-- 唯一事实来源：docs/工程/伦理自查.md。满足打 ✅，不适用标 N/A 加一句理由，否则在正文解释。 -->

This PR touches: data handling 数据处理 / AI integration AI 集成 / user-facing copy 用户可见文案

### 1 Evidence Integrity 证据完整性
- [ ] Originals immutable; edits create new versions 原始件不可变，编辑只出新版本
- [ ] Hash, timestamp, GPS frozen at capture 采集即固化哈希、时间戳与 GPS
- [ ] Evidence log append-only 证据日志仅可追加
- [ ] Artifact IDs stable & citable 编号稳定、可引用

### 2 Collection & Consent 采集与知情同意
- [ ] Consent precedes capture 同意先于采集
- [ ] Consent scoped & versioned 同意有范围、有版本
- [ ] Revocation honored end-to-end 撤回全链路生效（N/A if no deletion logic / 若不涉及删除逻辑）
- [ ] No covert collection 无隐蔽采集

### 3 Privacy & Compliance 隐私与合规
- [ ] Real names encrypted at rest 真名静态加密
- [ ] Analysis layer sees pseudonyms only 分析层只见化名
- [ ] Storage local & encrypted; sync opt-in 存储本地加密，同步默认关闭
- [ ] Remote wipe still reaches every copy 远程擦除仍覆盖全部数据

### 4 AI Integration AI 集成
- [ ] AI output is a proposal until confirmed AI 输出皆为提案
- [ ] Preview → confirm → reversible → audited 先确认再执行
- [ ] Safety survives model swaps 底线不随模型更换
- [ ] Participant data never repurposed 数据不挪作他用

### 5 User-Facing Copy 用户可见文案
- [ ] Copy follows phased bilingual convention (Chinese-first now; parity from international launch) 文案遵循分阶段双语（当前中文先行；国际化起对等）
- [ ] Scholarly tone, no jargon 学者语气，无黑话
- [ ] Machinery invisible to participants 后台机制对受访者无感

**N/A items + justification 不适用项及理由：**

**Unsatisfied items + plan 未满足项及计划（§1–§4 unsatisfiable → Maintainer Ethics Review / 若第 1–4 节有未满足项，须进入维护者伦理评审）：**

## Testing 验证

<!-- How was this verified? For confirmation paths, state the CI coverage (PRINCIPLES.md §5). -->
<!-- 如何验证？涉及确认路径的变更，请说明 CI 覆盖情况（PRINCIPLES.md 第 5 节）。 -->

## Bilingual 双语检查

- [ ] New user-facing strings ship in Chinese now; English tracked as debt (parity from international launch) 新增文案当前中文先行，英文债逐项跟踪（国际化起对等）（§4）
- [ ] Code/API identifiers are English-only 代码与接口命名仅用英文（§4）
