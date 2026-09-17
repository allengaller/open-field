# OpenField P1 架构设计

日期：2026-09-09
状态：已确认
范围：全系统架构定界 + P1 详细规格。P2/P3 只定接口与演进方向。

---

## 0. 定位与已确认约束

OpenField = Grounding AI in Human Reality。一套单人可携带的田野调查操作系统（Fieldwork OS），五层架构：采集 → 取证 → 沉淀 → 分析 → 输出。

本次设计前确认的关键决策：

| 决策 | 结论 | 对架构的影响 |
|---|---|---|
| 端形态 | 双端分工 | 手机轻薄端 + 桌面全功能端 |
| 同步 | 系统云服务（iCloud） | 落盘必须本地加密，云端只搬密文与已同意材料 |
| 采集 | Inbox 导入模式 | 核心价值 = 证据链登记 + 结构化，不重造录音机 |
| AI | 用户已有"手机录音 + 得到大脑"工作流 | P1 无 AI；外部转写文本作为一等公民导入 |
| P1 范围 | 桌面全功能 + 轻薄手机端 | 手机端只做 encounter 记录 / 同意存证 / 速记 |
| 技术路线 | 方案 A：TS 单语言联盟 | Electron + Expo + 共享 core 包 |

## 1. 总体架构

```
┌────────────────────────────────────────────────────────────┐
│ iCloud（系统云服务，只做搬运）                                │
│  · 录音/照片/文件经相册与文件 App 自然回流到 Mac               │
│  · 手机端把 encounter/同意书 bundle 写入 iCloud Drive 目录     │
└───────────────┬────────────────────────────────────────────┘
                │ 监听导入目录
┌───────────────▼────────────────────────────────────────────┐
│ OpenField Desktop（Electron + React）                       │
│  Main 进程服务层：                                           │
│   InboxWatcher  监听 Inbox/bundles，发现待导入文件            │
│   IngestService 算哈希→封存原始件→登记证据链（幂等）           │
│   VaultService  SQLCipher 加密库的打开/迁移/备份              │
│   VerifyService 全链校验+原始件哈希重算，出完整性报告          │
│   ExportService 学术引用生成/加密备份包导出                    │
│  Renderer：采集台 / 证据库 / 事件·访谈 / 知识库 / 日记 / 设置   │
│  存储：vault.db（SQLCipher）+ originals/（原始件只读封存）     │
└───────────────▲────────────────────────────────────────────┘
                │ iCloud bundle（编号化元数据，不含真名映射）
┌───────────────┴────────────────────────────────────────────┐
│ OpenField Mobile（Expo，轻薄）                               │
│  现场记 Encounter（编号/为何选TA/场景）· 知情同意存证 · 速记    │
│  本地库受 iOS Data Protection 保护；离线可用，联网自动出 bundle │
└────────────────────────────────────────────────────────────┘
```

隐私口径：**真名↔编号映射表只存在于桌面 vault**（整库 SQLCipher 加密）。手机端只接触编号与已获知情同意的材料，丢失设备泄露面与"录音经 iCloud 回流"一致。

## 2. 证据链设计（核心壁垒）

### 2.1 EvidenceLog

append-only 表，链式哈希。字段：

```
seq          INTEGER  全链单调递增
ts           INTEGER  设备时间（epoch ms）
actor        TEXT     'desktop' | 'mobile:<deviceId>'
action       TEXT     见 2.2
payload_hash TEXT     SHA-256（本条操作涉及内容的哈希）
prev_hash    TEXT     前一条 entry_hash（首条为 64 个 '0'）
entry_hash   TEXT     SHA-256(seq ‖ prev_hash ‖ ts ‖ actor ‖ action ‖ payload_hash)
```

任何对历史记录的篡改都会导致后续所有 entry_hash 校验失败；VerifyService 重算全链即可检出。

### 2.2 action 类型

`INGEST_ARTIFACT`（登记采集物）/ `CREATE_EVENT` / `CREATE_ENCOUNTER` / `CREATE_PARTICIPANT` / `CONSENT_RECORDED` / `CREATE_MEMO` / `MEMO_CONFIRM`（AI 或规则草稿经人工确认）/ `EXPORT` / `TIME_SYNC` / `PURGE_SUBJECT`（PIPL 删除：只记录删除事实与范围，不含已删内容）。参与者与 Memo 行在服务层创建时同样入链（`CREATE_PARTICIPANT` / `CREATE_MEMO`），保证 vault 内每一行都有链上来源。

### 2.3 原始件封存

- 路径：`originals/<artifactId>/v1.<ext>`，写入后立即设为只读；一切"编辑"产生 v2、v3 新文件，v1 永不改动。
- Artifact 表记录 `sha256, size, mime, captured_at, gps?, device_id, version, encounter_id`。
- 校验：VerifyService 重算原始件哈希并与登记值比对。

### 2.4 可信时间戳的 P1 简化

本地设备时间可被修改。P1 策略：每次联网时在链上追加一条 `TIME_SYNC` entry（记录 NTP 校验得到的时钟偏移），使"采集时刻的时间被改过"可被事后检出。RFC3161 可信时间戳权威（TSA）留给 P2+。

### 2.5 引用 ID

格式 `OF-YYYYMMDD-CCC-NNN#Tmmss`（日期-城市码-序号#录音内时间点）。城市码为 3 位字母，维护在 FieldEvent 上（用户创建 Event 时选择或新建），引用 ID 从所属 Event 继承。P1 即实现标准学术引用生成（含证据哈希，审稿人可验证）。

## 3. 数据模型（P1）

README 六实体全保留（FieldEvent / Encounter / Artifact / Participant / EvidenceLog / Memo），新增三个：

| 实体 | 说明 |
|---|---|
| ConsentRecord | 独立成表：模板类型（录音/肖像/发表范围）、签名图片 Artifact、口头同意录音 Artifact、同意范围、撤回标记 |
| InboxItem | 导入暂存区：待归类文件 → 人工确认归属 Event/Encounter 后才正式 INGEST |
| TimeSyncRecord | NTP 校验记录（同时入链） |

匿名化：`real_name` 只存独立表 `participant_identity`；分析层查询与 UI 默认不 JOIN 此表。PIPL 删除权：按 pseudonym 级联清除该受访者全部数据，删除操作本身以 `PURGE_SUBJECT` 入链留痕（只记录删除事实与范围，不含已删内容）。

## 4. 导入流（P1 主工作流）

1. 三个来源汇入导入目录：手机 bundle（iCloud Drive/OpenField/bundles/）、iCloud 回流的录音/照片、手动拖入或指向的文件夹。P1 bundle 不做密码学签名：完整性由 ingest 时哈希登记建立，schema 校验失败的进隔离区。
2. InboxWatcher 发现文件 → 按"时间窗口 ±2h + EXIF GPS"规则聚类，提示归属到哪个 FieldEvent / Encounter，人工确认。
3. 确认后 IngestService 单事务完成：算 SHA-256 → 存 originals → 写 Artifact → 写 EvidenceLog。
4. 幂等：同哈希文件重复出现 → 跳过并提示，绝不二次登记。
5. 每日日记：按日期规则聚合当日 Event/Encounter/Artifact 生成结构化时间线草稿，用户补写反思、确认后 `MEMO_CONFIRM` 入链。
6. 外部转写文本（得到/Get 笔记导出的 docx/txt）作为一等公民导入，关联到对应 Artifact（音频）。

## 5. 错误处理

| 场景 | 处理 |
|---|---|
| 哈希不匹配（损坏/被改） | Ingest 拒绝入库并标红；已入库的由 Verify 报告暴露 |
| iCloud 占位文件（未下载完） | 识别 `.icloud` 占位符，等待完成或提示，不把空文件当原始件 |
| 断电/崩溃 | SQLCipher 事务保 DB 一致；originals 用 temp+rename 原子写入 |
| 畸形 bundle | 移入 `quarantine/` 隔离区，不污染主库 |
| vault 口令丢失 | 无找回。首次启动强制用户确认已抄写恢复口令（证据链系统的合理代价） |

## 6. 测试策略

- `@openfield/core` 单测：哈希链篡改/断链检测、INGEST 幂等、bundle schema 校验（zod）。
- IngestService 集成测：音频/照片 fixture、重复导入、损坏文件、`.icloud` 占位符。
- VerifyService golden 测试：正常链 vs 被篡改链的判定结果。
- E2E 冒烟：Playwright 驱动 Electron 走通"导入 → 登记 → 检索 → 引用"。
- 终极验证（README 铁律）：P1 完成后背它跑完一次真实田野行程。

## 7. 仓库结构与技术栈

```
OpenField/
├─ packages/core/     # 纯 TS：zod 数据模型、哈希链、bundle 格式（无 UI 依赖）
├─ apps/desktop/      # Electron：main/（五个服务）+ renderer/（React）
├─ apps/mobile/       # Expo 轻薄端（encounter/同意/速记 → bundle）
└─ docs/              # PRINCIPLES.md、ADR
```

技术栈：pnpm workspace、TypeScript 5、Electron 33+、better-sqlite3 链接 SQLCipher、Expo SDK 52+、zod。选型原则：AI 辅助编程生态成熟、单人可维护。

## 8. P1 之后（只定方向，不在本规格内展开）

- **P1.5**：内置录音（如 Inbox 模式验证后仍需要）、RFC3161 可信时间戳。
- **P2**：知识库四维索引（人物×地点×时间×主题）、匿名化流水线、普通话转写接入、手机端增强、关系图谱（引荐链）。
- **P3**：AI 编码提案（只提案人工确认）、三角验证视图（孤证标记）、REFI-QDA 导出、反身性提醒。

## 9. 风险与对策（继承 README 两条 + 新增一条）

1. **敏感数据物理安全**：桌面 vault SQLCipher 整库加密；手机端 iOS Data Protection + 不存真名映射；iCloud 只搬运密文与已同意材料。远程擦除依赖系统"查找"能力，不自建。
2. **取证与信任的张力**：同意流程对话化（模板+一键录音口头同意），哈希固化全部后台静默完成，受访者全程无感。
3. **单人开发节奏风险**：P1 砍掉内置录音、AI、云中转服务器三大件，核心验证目标（证据链 + 数据模型跑通真实田野）不受影响。
