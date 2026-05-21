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
  return `你是一个开发者状态恢复助手，专门帮助开发者在疲劳、焦虑、卡住或困倦时快速恢复并找到最小下一步。

开发者当前状态：
- 状态类型：${state.label}
- 当前任务：${task}
- 想继续硬扛的冲动：${hardCarryScore}/10
- 当前清晰度：${clarityScore}/10

请生成一个 JSON 对象，包含以下字段：
- decision: 建议动作（15字以内）
- reason: 为什么卡住的分析（1-2句话）
- body: 30秒身体恢复指令（具体、可执行）
- next: 最小下一步行动（可在5分钟内完成）
- savedMinutes: 预估避免的无效时间（数字，15-45之间）`;
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

    const protocol = {
      source: "llm",
      provider: process.env.DEEPSEEK_API_KEY ? "deepseek" : "qwen",
      mood,
      moodLabel: state.label,
      task,
      hardCarryScore,
      clarityScore,
      handoff,
      decision: handoff
        ? "休息，并把最小任务交给 Agent"
        : (content.decision as string) || state.decision,
      reason: (content.reason as string) || state.cause,
      savedMinutes:
        typeof content.savedMinutes === "number"
          ? content.savedMinutes
          : hardCarryScore >= 9
            ? 40
            : hardCarryScore >= 7
              ? 25
              : 15,
      minimalNext: handoff
        ? "复制交接 Prompt，让 Agent 只做复现、定位或列出最小修复建议。"
        : (content.next as string) || state.next,
      steps: [
        {
          title: "身体恢复",
          body: (content.body as string) || state.body,
        },
        {
          title: "任务诊断",
          body: (content.reason as string) || state.cause,
        },
        {
          title: handoff ? "Agent 接管" : "最小下一步",
          body: handoff
            ? "复制交接 Prompt，让 Agent 只做复现、定位或列出最小修复建议。"
            : (content.next as string) || state.next,
        },
      ],
      prompt: handoff
        ? `【目标】\n在我休息期间，接手并完成以下任务的最小下一步：${task}\n\n【验证方式】\n完成后应能明确回答：\n1. 问题能否复现？复现步骤是什么？\n2. 最可能的 3 个原因是什么？\n3. 最小修复建议是什么（只改一处）？\n\n【约束】\n- 不要重构，不要扩展范围\n- 不要改动无关文件\n- 优先复现和定位，不急着改代码\n- 输出下一步可以验证的命令或检查点\n\n【检查点】\n开始前运行 git status 确认基线，所有改动控制在最小范围。\n\n【上下文】\n- 我的状态：${state.label}\n- 硬扛冲动：${hardCarryScore}/10\n- 清晰度：${clarityScore}/10\n- 继续硬扛会降低交付质量，请帮我守住最小边界。`
        : `【目标】\n执行 3 分钟 Reset 后，完成最小下一步：${task}\n\n【验证方式】\n1. 身体恢复：做 3 次慢呼吸，肩膀是否比刚才放松？\n2. 任务简化：能否用一句话说清当前问题的核心？\n3. 行动验证：${minimalNext}\n\n【约束】\n- 不新增功能\n- 不追求完美方案\n- 只验证一个最小假设\n\n【检查点】\n- 身体恢复：肩膀是否比刚才放松？\n- 任务简化：能否用一句话说清当前问题的核心？\n- 行动验证：${minimalNext}\n\n【当前状态】\n${state.label} | 硬扛冲动 ${hardCarryScore}/10 | 清晰度 ${clarityScore}/10`,
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
