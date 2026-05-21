# Reset Agent

开发者的 3 分钟状态恢复协议。它在你疲劳、焦虑、卡住或准备无效硬扛时，帮你判断下一步应该继续、休息，还是把任务交给 Agent。

## 项目亮点

- **Developer Reset Protocol**：状态选择、任务诊断、恢复引导、任务重启、前后验证。
- **Agent Handoff**：状态过差时生成可复制给 Codex / Cursor / Claude Code 的任务交接 Prompt。
- **零后端 MVP**：纯静态页面即可运行，核心数据保存在浏览器本地。
- **面向黑客松现场**：目标用户就在现场，Demo 场景天然成立。

## 本地运行

这个版本不需要安装依赖，直接打开 `index.html` 即可。

如果希望用本地服务器预览：

```bash
node serve.js
```

然后访问：

```text
http://localhost:4173
```

一键 Demo：

```text
http://localhost:4173/?demo=1
```

## 截图

![Desktop Demo](./assets/desktop.png)

![Mobile Demo](./assets/mobile.png)

![Poster](./assets/poster.png)

## 提交物

- 可运行网站：`index.html`
- 项目海报：`poster.html` / `assets/poster.png`
- 项目计划：[PLAN.md](./PLAN.md)

## 后续可接入

- OpenAI / 通义千问 API，用真实模型替换本地规则生成。
- Vercel 部署，把 Demo 链接换成线上地址。
- 真实健康数据输入，例如 Apple Watch / Oura / WHOOP 的恢复状态。
