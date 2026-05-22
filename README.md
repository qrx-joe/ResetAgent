# Reset Agent

> 开发者的 3 分钟状态恢复协议：疲劳、焦虑、卡住时，判断该继续、休息，还是交给 Agent。

---

## 项目背景

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.2.6 |
| 运行时 | React | 19.0.0 |
| 语言 | TypeScript | 5.x |
| 样式 | 原生 CSS | — |
| 测试 | Playwright | 1.60.0 |
| 部署 | Vercel | — |
| AI 模型 | 通义千问 / DeepSeek | qwen-turbo / deepseek-chat |

### 技术亮点

- **双模协议生成引擎解决 API 不稳定风险**：LLM API 优先调用，失败时自动 fallback 到本地规则引擎。规则引擎内置任务感知启发式分析，根据用户输入的关键词动态调整诊断建议，保证黑客松现场网络波动时核心功能仍可运行。
- **纯静态前端 + API 代理的混合架构解决密钥泄露问题**：前端是零构建的 HTML/CSS/JS，API 密钥完全留在服务端环境变量中，通过 Next.js API Route 代理调用大模型。既保留了"git push 即部署"的零后端体验，又避免了浏览器端暴露密钥的安全风险。
- **渐进式 4 屏向导降低认知负担**：状态选择 → 卡点描述 → 3 分钟倒计时 Reset → Agent 交接。每屏只做一件事，配合进度条导航和步骤锁定，让处于疲劳/焦虑状态的用户不会被信息淹没。
- **Agent Handoff 解决"人停下来、任务断掉"的断层**：当用户硬扛冲动过高或清晰度过低时，自动生成包含【目标】【约束】【检查点】的结构化交接 Prompt，可直接复制给 Codex / Cursor / Claude Code 接管任务。
- **恢复前后量化对比**：本地保存每次 Reset 的恢复前后评分，生成可截图的"今日状态卡片"，把抽象的"休息一下"变成可追踪的数据。

### 项目演示

- 线上地址：https://reset-agent-green.vercel.app
- 一键 Demo：https://reset-agent-green.vercel.app/index.html?demo=auto

### 学到的内容

- 面对"24 小时黑客松 + 需要稳定 Demo"的约束，选择了**纯静态前端 + Next.js API Route**的混合架构，而不是全 Next.js SSR 应用。因为纯静态文件可直接部署到任意 CDN，API 层仅在需要时启动，大幅降低部署复杂度和冷启动风险。
- 面对"LLM API 在现场可能不稳定"的风险，设计了**API 优先 + 规则引擎 fallback**的双模架构，而不是单一依赖外部 API。因为现场 Demo 时网络波动或 API 限流会导致产品直接不可用，本地规则引擎保证核心功能永远可运行（commit `a5b358a` 中确立的架构决策）。
- 面对"激进视觉设计 vs 功能完整性"的权衡，从 Glassmorphism + 呼吸动画的激进方案（见 [docs/UI_REFACTOR_PLAN.md](./docs/UI_REFACTOR_PLAN.md)）退回到 minimal black theme 的务实路线。因为 24 小时内好看≠好用，核心流程跑通优先于视觉效果（commit `76f3c44`）。
- 面对"单页表单在移动端体验差 + 疲劳用户认知资源有限"的问题，从平铺页面重构为**4 屏渐进式向导**，每屏只做一件事。因为渐进式披露（Progressive Disclosure）比信息堆砌更适合高压状态下的用户（commit `76f3c44`）。
- 面对"交接 Prompt 太泛、Agent 接不住"的问题，将 prompt 结构从通用对话风格升级为 **/goal 风格**（【目标】【约束】【检查点】【交付】）。因为测试发现结构化约束能让 Agent 的输出更聚焦、更可验证（commit `005315b`）。
- 面对"API 可能被绕过直接调用"的风险，在服务端增加了 `hardCarryScore` 和 `clarityScore` 的范围校验（1-10），而不是仅依赖前端校验。因为安全边界必须在服务端守住（commit `5ce6504`）。

---

## 使用文档

### 本地运行

```bash
npm install
npm run dev
```

访问 http://localhost:3000

一键 Demo：http://localhost:3000/index.html?demo=auto

### 环境变量

大模型调用需要配置以下环境变量（见 [docs/ENV.md](./docs/ENV.md)）：

```env
# 通义千问
QWEN_API_KEY=your_key
QWEN_API_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
QWEN_MODEL=qwen-turbo

# 或 DeepSeek
DEEPSEEK_API_KEY=your_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

**注意**：不配置环境变量时，系统会回退到本地规则引擎，仍可完整运行。

### 项目结构

```
├── app/
│   ├── api/reset/route.ts    # Next.js API Route：代理调用大模型
│   ├── layout.tsx            # 根布局
│   └── page.tsx              # 重定向到静态页面
├── public/                   # 纯静态前端（零构建）
│   ├── index.html            # 单页应用入口
│   ├── app.js                # UI 交互逻辑
│   ├── styles.css            # 全部样式
│   ├── js/
│   │   └── protocol-engine.js   # 协议生成引擎（API + 规则引擎 fallback）
│   └── poster.html           # 项目海报页面
├── docs/
│   ├── PLAN.md               # 原始参赛方案
│   ├── ENV.md                # 环境变量说明
│   └── UI_REFACTOR_PLAN.md   # UI 重构设计文档
├── assets/                   # 截图资源
└── e2e-test.js               # Playwright E2E 测试
```

### 协议生成双模式

`public/js/protocol-engine.js` 提供两种协议生成方式：

1. **API 模式（优先）**：调用 `/api/reset`，服务端读取环境变量调用真实模型，失败时自动 fallback。
2. **规则引擎（兜底）**：零依赖、零延迟，根据状态类型 + 任务内容启发式分析生成协议。

### 核心数据流

```
用户选择状态 + 描述卡点
        ↓
  protocol-engine.js
        ↓
  优先调用 /api/reset（LLM 生成个性化协议）
        ↓ 失败或超时
  自动 fallback 到规则引擎（本地零依赖生成）
        ↓
  3 分钟倒计时引导 → 恢复后验证 → 生成状态卡片 / Agent 交接 Prompt
```

### 开发命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 构建
npm run type-check # TypeScript 类型检查
npm run lint       # ESLint 检查
```

### E2E 测试

```bash
# 先启动静态文件服务
node e2e-test.js   # Playwright 端到端测试
```

---

## 参赛信息

- **活动**：Good Night, Hackers 黑客松
- **时间**：2026 年 5 月 21 日 - 22 日（24 小时）
- **形式**：个人参赛
- **提交物**：可运行网站 + 项目海报 + 公开仓库
