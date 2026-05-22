import { NextRequest, NextResponse } from "next/server";

// 状态映射（后端也需要用于构建 prompt）
const stateMap: Record<
  string,
  { label: string; decision: string; cause: string; body: string; next: string }
> = {
  stuck: {
    label: "卡住",
    decision: "先降级任务，再继续",
    cause:
      "你现在的问题更像是任务边界过大，反馈回路太慢。继续硬扛会让修改范围越来越散。",
    body: "离开屏幕 30 秒，双脚踩地，慢慢呼气 4 次。回来后只打开一个相关文件。",
    next: "写下一句可验证假设：如果只改一个地方，我会先检查哪里？",
  },
  tired: {
    label: "疲劳",
    decision: "先恢复，再做一个小验证",
    cause: "你的判断力正在下降，继续写新代码很容易制造额外 bug。",
    body: "站起来喝水，肩膀向后绕 8 次，眼睛看远处 20 秒。",
    next: "只跑一次最小测试或刷新一次页面，不新增功能。",
  },
  anxious: {
    label: "焦虑",
    decision: "先收窄展示面",
    cause:
      "你可能在同时满足太多标准：技术、体验、评委印象、提交完整度。",
    body: "把手离开键盘，做 3 次慢呼吸，然后说出现在最重要的一个提交物。",
    next: "只保留一个用户故事，删掉会分散 Demo 的功能。",
  },
  sleepy: {
    label: "困倦",
    decision: "休息，并把任务交给 Agent",
    cause:
      "困倦时继续推进会显著增加低级错误，最健康的下一步是降低人工负荷。",
    body: "设置 20 分钟休息，离开屏幕。不要在床上继续看代码。",
    next: "把当前任务、边界和期望输出交给 Agent，让它先做复现或排查。",
  },
  pain: {
    label: "肩颈痛",
    decision: "先解除身体警报",
    cause: "身体紧张会抢占注意力。现在不是意志力问题，是输入系统已经报警。",
    body: "站起来，下巴微收，肩胛骨向后夹 6 次，手臂向上伸展 20 秒。",
    next:
      "回来后只做一个无需长时间盯屏的小操作：记录问题、跑测试或提交当前可用版本。",
  },
};

function isHandoffRecommended(
  mood: string,
  hardCarryScore: number,
  clarityScore: number
) {
  return mood === "sleepy" || hardCarryScore >= 8 || clarityScore <= 3;
}

function normalizeChatEndpoint(endpoint: string) {
  const trimmed = endpoint.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  if (trimmed.endsWith("/compatible-mode/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function parseJsonContent(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

type ResetStep = {
  title: string;
  body: string;
};

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeExecutionSteps(value: unknown): ResetStep[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const step = item as Record<string, unknown>;
      const title = asText(step.title);
      const body = asText(step.body);
      if (!title || !body) return null;
      return { title, body };
    })
    .filter((item): item is ResetStep => Boolean(item))
    .slice(0, 3);
}

function buildFallbackExecutionSteps(task: string, minimalNext: string): ResetStep[] {
  return [
    {
      title: "复述卡点",
      body: `把当前问题压缩成一句可验证描述：${task}`,
    },
    {
      title: "隔离变量",
      body: "只保留一个最可能相关的页面、接口或文件，暂停新增功能和视觉微调。",
    },
    {
      title: "验证一次",
      body: minimalNext,
    },
  ];
}

function buildAgentPrompt({
  task,
  moodLabel,
  hardCarryScore,
  clarityScore,
  reason,
  minimalNext,
  executionSteps,
}: {
  task: string;
  moodLabel: string;
  hardCarryScore: number;
  clarityScore: number;
  reason: string;
  minimalNext: string;
  executionSteps: ResetStep[];
}) {
  const steps = executionSteps
    .map((step, index) => `${index + 1}. ${step.title}：${step.body}`)
    .join("\n");

  return `【目标】
接手下面这个开发卡点，并完成一个可验证的最小下一步。

【当前卡点】
${task}

【状态】
- 当前状态：${moodLabel}
- 硬扛冲动：${hardCarryScore}/10
- 清晰度：${clarityScore}/10

【卡点判断】
${reason}

【建议执行步骤】
${steps}

【最小下一步】
${minimalNext}

【约束】
- 不要重构，不要扩展范围
- 不要改动无关文件
- 优先复现、定位、验证，不急着堆功能
- 每一步都要能在 5 分钟内验证

【交付】
请输出：你执行了哪一步、观察到什么、下一步最小建议是什么。`;
}

function buildSystemPrompt({
  mood,
  task,
  hardCarryScore,
  clarityScore,
}: {
  mood: string;
  task: string;
  hardCarryScore: number;
  clarityScore: number;
}) {
  const state = stateMap[mood];
  return `你是 Reset Agent，一个面向开发者的状态恢复与任务拆解助手。

你的任务不是泛泛安慰，也不是逐字复述用户输入，而是根据用户真实卡点生成：
1. 当前为什么卡住
2. 3 分钟内如何恢复判断力
3. 接下来如何拆成可执行、可验证的小步骤
4. 可以直接复制给编程 Agent 的交接 Prompt

开发者当前状态：
- 状态类型：${state.label}
- 当前任务：${task}
- 想继续硬扛的冲动：${hardCarryScore}/10
- 当前清晰度：${clarityScore}/10

请只返回 JSON 对象，不要 Markdown，不要代码块。字段如下：
- decision: 针对当前卡点的建议动作，15字以内，必须具体。
- reason: 为什么会卡住，1-2句话，必须引用或概括用户输入里的具体情况。
- recoveryAction: 30秒身体恢复指令，具体、可执行。
- minimalNext: 最小下一步行动，必须能在5分钟内完成。
- executionSteps: 3个执行步骤数组，每个元素包含 title 和 body。步骤要围绕用户输入的具体卡点，避免“继续优化”“检查一下”这种空话。
- handoffPrompt: 可以直接复制给 Codex/Cursor/Claude Code 的交接 Prompt，包含目标、上下文、执行步骤、约束、验收标准。
- savedMinutes: 预估避免的无效时间，数字，15-45之间。

生成要求：
- 如果用户说的是部署、白屏、接口、UI、Demo、调试、需求变化，要针对这个场景给步骤。
- 如果信息不足，第一步应该是最小复现或补充观察，而不是直接改代码。
- 不要建议大重构，不要扩大范围。
- 语言要短、硬、能执行。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mood, task, hardCarryScore, clarityScore } = body;

    if (!mood || !task || hardCarryScore == null || clarityScore == null) {
      return NextResponse.json(
        { error: "缺少必要参数: mood, task, hardCarryScore, clarityScore" },
        { status: 400 }
      );
    }

    if (!stateMap[mood]) {
      return NextResponse.json(
        { error: "无效状态类型" },
        { status: 400 }
      );
    }

    const apiKey = process.env.QWEN_API_KEY || process.env.DEEPSEEK_API_KEY;
    const apiEndpoint =
      process.env.QWEN_API_ENDPOINT ||
      process.env.DEEPSEEK_API_ENDPOINT ||
      (process.env.DEEPSEEK_BASE_URL
        ? normalizeChatEndpoint(process.env.DEEPSEEK_BASE_URL)
        : "") ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    const model =
      process.env.QWEN_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      (process.env.DEEPSEEK_API_KEY ? "deepseek-chat" : "qwen-turbo");

    if (!apiKey) {
      return NextResponse.json(
        { error: "API 密钥未配置" },
        { status: 503 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const llmResponse = await fetch(apiEndpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt({
              mood,
              task,
              hardCarryScore,
              clarityScore,
            }),
          },
          { role: "user", content: "请生成 Reset 协议。" },
        ],
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("[API] LLM 调用失败:", llmResponse.status, errorText);
      return NextResponse.json(
        { error: `LLM 服务错误: ${llmResponse.status}` },
        { status: 502 }
      );
    }

    const data = await llmResponse.json();
    const raw = data.choices?.[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "LLM 返回内容为空" },
        { status: 502 }
      );
    }

    let content: Record<string, unknown>;
    try {
      content = parseJsonContent(raw);
    } catch {
      return NextResponse.json(
        { error: "LLM 返回格式无效", raw },
        { status: 502 }
      );
    }

    const state = stateMap[mood];
    const handoff = isHandoffRecommended(mood, hardCarryScore, clarityScore);
    const reason = asText(content.reason, state.cause);
    const recoveryAction = asText(
      content.recoveryAction,
      asText(content.body, state.body)
    );
    const minimalNext = asText(
      content.minimalNext,
      asText(content.next, state.next)
    );
    const normalizedSteps = normalizeExecutionSteps(content.executionSteps);
    const executionSteps =
      normalizedSteps.length > 0
        ? normalizedSteps
        : buildFallbackExecutionSteps(task, minimalNext);
    const savedMinutes = clamp(
      asNumber(
        content.savedMinutes,
        hardCarryScore >= 9 ? 40 : hardCarryScore >= 7 ? 25 : 15
      ),
      15,
      45
    );
    const handoffPrompt = asText(
      content.handoffPrompt,
      buildAgentPrompt({
        task,
        moodLabel: state.label,
        hardCarryScore,
        clarityScore,
        reason,
        minimalNext,
        executionSteps,
      })
    );

    const protocol = {
      source: "llm",
      provider: process.env.DEEPSEEK_API_KEY ? "deepseek" : "qwen",
      mood,
      moodLabel: state.label,
      task,
      hardCarryScore,
      clarityScore,
      handoff,
      decision: asText(content.decision, handoff ? "交给 Agent 接管" : state.decision),
      reason,
      savedMinutes,
      minimalNext,
      steps: [
        {
          title: "身体恢复",
          body: recoveryAction,
        },
        { title: "卡点判断", body: reason },
        ...executionSteps,
      ],
      prompt: handoffPrompt,
    };

    return NextResponse.json(protocol);
  } catch (err) {
    console.error("[API] 未捕获错误:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json(
      { error: `服务器内部错误: ${message}` },
      { status: 500 }
    );
  }
}
