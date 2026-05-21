# Reset Agent

开发者的 3 分钟状态恢复协议。它在你疲劳、焦虑、卡住或准备无效硬扛时，帮你判断下一步应该继续、休息，还是把任务交给 Agent。

## 项目亮点

- **Developer Reset Protocol**：状态选择 → 任务诊断 → 恢复引导 → 任务重启 → 前后验证。
- **Agent Handoff**：状态过差时生成可复制给 Codex / Cursor / Claude Code 的任务交接 Prompt。
- **任务感知诊断**：规则引擎会分析你输入的任务内容（关键词、长度、上下文），给出更精准的诊断，而不是千人一面的模板。
- **服务端 LLM 代理**：Next.js API route 调用通义千问 / DeepSeek，密钥不暴露到浏览器。
- **零后端 MVP**：纯静态页面即可运行，核心数据保存在浏览器本地。

## 技术架构

> **为什么从 Next.js 切换到原生 HTML/CSS/JS？**
>
> 原始计划使用 Next.js 15 + Tailwind + shadcn/ui（见 [docs/PLAN.md](./docs/PLAN.md)）。实际开发中评估后切换为纯原生技术栈，原因：
> - 项目为单页零后端应用，不需要 Next.js 的 SSR/SSG 能力
> - 原生 ES Module 直接运行，省去构建配置和打包时间
> - 自定义 CSS 在此规模下比 Tailwind utility-first 更直观可控
> - 纯静态文件可直接部署到任何 CDN，无需 Node 运行时
> - 24 小时黑客松中，减少构建步骤 = 减少故障面和认知负担

```
├── index.html          — 单页应用入口
├── app.js              — UI 层（ES Module）
├── js/
│   └── protocol-engine.js — 协议生成引擎（规则引擎 + API 预留层）
├── styles.css          — 全部样式
├── poster.html         — 项目海报页面
├── serve.js            — 本地开发服务器
├── docs/
│   └── PLAN.md         — 原始项目计划
└── assets/             — 截图资源
```

### 协议生成双模式

`js/protocol-engine.js` 提供两种协议生成方式：

1. **规则引擎（默认）**：零依赖、零延迟，根据状态类型 + 任务内容启发式分析生成协议。
2. **API 模式**：浏览器请求 `/api/reset`，由 Next.js 服务端代理调用真实模型，失败时自动 fallback 到规则引擎。

当前 `public/js/protocol-engine.js` 默认优先请求 `/api/reset`。本地运行 Next 服务后即可使用：

```bash
npm run dev
```

环境变量和密钥说明见 [docs/ENV.md](./docs/ENV.md)。当前静态 MVP 默认不需要 `.env`。

## 本地运行

推荐使用 Next.js 本地服务，这样 `/api/reset` 才能调用大模型：

```bash
npm run dev
```

然后访问：

```text
http://localhost:3000
```

一键 Demo：

```text
http://localhost:4173/?demo=1
```

## 线上 Demo

- Demo: https://reset-agent-green.vercel.app
- 一键 Demo: https://reset-agent-green.vercel.app/index.html?demo=1

## 截图

![Desktop Demo](./assets/desktop.png)

![Mobile Demo](./assets/mobile.png)

![Poster](./assets/poster.png)

## 提交物

- 可运行网站：`index.html`
- 项目海报：`poster.html` / `assets/poster.png`
- 项目计划：[docs/PLAN.md](./docs/PLAN.md)

## 后续可接入

- [x] 规则引擎任务感知分析（已实现）
- [x] API 预留层 + fallback 机制（已实现）
- [x] 接入 DeepSeek 真实模型（服务端代理 + fallback）
- [x] Vercel 部署，把 Demo 链接换成线上地址
- [ ] 真实健康数据输入，例如 Apple Watch / Oura / WHOOP 的恢复状态
