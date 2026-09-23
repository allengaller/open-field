# @openfield/web — OpenField 知识库 Web App

React + Vite + TypeScript。渲染 `@openfield/knowledge` 预生成的两套田野调查语料
（`docs/田野方法`、`docs/社会学田野`），客户端全文检索，无后端。

## 开发

```bash
pnpm --filter @openfield/web dev      # http://localhost:5173（HashRouter）
pnpm --filter @openfield/web build    # 产物在 dist/
pnpm --filter @openfield/web test
```

## 路由

- `/` 首页：合集卡片、学习路径、快捷入口
- `/c/:cid`、`/c/:cid/:chapterId` 合集目录与章节（`?to=sec-x.x` 锚点跳转）
- `/glossary` 术语表（两套合集）
- `/search?q=` 全文检索（标题 ×3 / 节标题 ×2 / 正文 ×1，top 20）

## 内容更新流程

1. 修改 `docs/田野方法/` 或 `docs/社会学田野/` 下的 markdown。
2. `pnpm --filter @openfield/knowledge build`（重新生成 `packages/knowledge/dist`，需提交入库）。
3. `pnpm --filter @openfield/web build`。

## Meoo CDN 发布（手动）

沿用静态官网 `website/` 的发布方式：把 `apps/web/dist/` 产物同步到 CDN 对应目录。
`vite.config.ts` 已设 `base: './'`（相对资源路径），子路径托管无需额外配置；
路由用 HashRouter，服务端无需 SPA 回退规则。

```bash
pnpm --filter @openfield/web build
# 用现有 Meoo 上传通道把 apps/web/dist/ 推到目标路径
```

## 安全说明

章节 HTML 来自仓库内 markdown，构建期由 `packages/knowledge` 断言不含 `<script` / `javascript:`，
运行时经 `dangerouslySetInnerHTML` 注入。不要把外部来源的内容接入该管道而不经过构建断言。
