# Environment Variables

Reset Agent 当前版本是纯静态 MVP，默认使用浏览器内的本地规则引擎生成协议，**运行网站不需要 `.env` 或 API Key**。

## 本地运行

```bash
node serve.js
```

默认端口：

```env
PORT=4173
```

如需修改端口，可以在启动前设置 `PORT`。

## 大模型配置

当前前端已经在 `js/protocol-engine.js` 里预留了 API 模式，但它是浏览器端配置，适合 Demo 调试，不适合公开部署时直接使用真实密钥。

公开部署时不要把 `API_KEY` 写进：

- `index.html`
- `app.js`
- `js/protocol-engine.js`
- README 示例
- 浏览器 localStorage

当前项目已经使用 Next.js API route 作为服务端代理：

```text
/api/reset
```

浏览器请求 `/api/reset`，由服务端读取环境变量并调用真实模型。不要在浏览器端保存真实密钥。

## 通义千问 / DashScope

```env
QWEN_API_KEY=your_real_key_here
QWEN_API_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
QWEN_MODEL=qwen-turbo
```

## DeepSeek

```env
DEEPSEEK_API_KEY=your_real_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

## 通用变量（预留）

```env
RESET_AGENT_ENABLE_API=true
RESET_AGENT_API_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
RESET_AGENT_API_KEY=your_real_key_here
RESET_AGENT_MODEL=qwen-turbo
RESET_AGENT_TIMEOUT_MS=8000
```

## 文件说明

- `.env.example`：可提交，用来说明需要哪些变量。
- `.env`：本地真实配置，已被 `.gitignore` 忽略，不要提交。
- `docs/ENV.md`：环境变量和密钥使用说明。

## 黑客松建议

提交和现场 Demo 优先使用默认规则引擎，保证稳定可跑。大模型可以作为增强项展示，但不要让项目成败依赖外部 API。
