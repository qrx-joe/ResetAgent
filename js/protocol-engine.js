/**
 * Protocol Engine
 * 负责生成 Reset 协议。
 *
 * 支持两种模式：
 * 1. 规则引擎（本地 fallback，零依赖）
 * 2. API 调用（预留接口，需配置端点和密钥）
 *
 * 默认使用规则引擎。如需接入真实 LLM：
 *   CONFIG.ENABLE_API = true
 *   CONFIG.API_ENDPOINT = 'https://your-api.com/v1/chat/completions'
 *   CONFIG.API_KEY = 'your-key'
 */

// ============ 配置 ============
export const CONFIG = {
  API_ENDPOINT: localStorage.getItem("reset-agent-api-endpoint") || "",
  API_KEY: localStorage.getItem("reset-agent-api-key") || "",
  ENABLE_API: false,
  FALLBACK_ENABLED: true,
  MODEL: "qwen-turbo",
  TIMEOUT_MS: 8000,
};

export function updateConfig(updates) {
  Object.assign(CONFIG, updates);
  if (updates.API_ENDPOINT !== undefined) {
    localStorage.setItem("reset-agent-api-endpoint", updates.API_ENDPOINT);
  }
  if (updates.API_KEY !== undefined) {
    localStorage.setItem("reset-agent-api-key", updates.API_KEY);
  }
}

// ============ 规则引擎数据 ============
const stateMap = {
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
    cause: "困倦时继续推进会显著增加低级错误，最健康的下一步是降低人工负荷。",
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

// ============ 启发式分析：让 task 内容影响诊断 ============
function analyzeTask(task, mood) {
  const t = task.toLowerCase();
  const insights = [];

  if (task.length > 80 && mood === "stuck") {
    insights.push("任务描述较长，建议先把它压缩成一句话的核心问题。");
  }

  if (/bug|报错|错误|exception|error|crash|fail|崩/.test(t)) {
    if (mood === "tired") {
      insights.push("疲劳时调试容易越改越乱，建议先恢复再定位。");
    } else if (mood === "stuck") {
      insights.push("遇到报错卡住时，先隔离最小复现场景比全面排查更有效。");
    }
  }

  if (/不知道|不清楚|迷茫|无从下手|不知道从哪里|怎么开始/.test(t)) {
    insights.push("你对任务缺乏清晰起点，这说明需要先做任务降级。");
  }

  if (/小时|hour|deadline|截止|来不及|时间不够/.test(t)) {
    insights.push("时间压力正在放大当前状态，先停下来反而能缩短总耗时。");
  }

  if (/demo|展示|答辩|present|judge|评委/.test(t) && mood === "anxious") {
    insights.push("Demo 焦虑是黑客松常态，把展示目标砍到只剩一个核心故事。");
  }

  if (/重构|重写|优化|改进|升级|better/.test(t)) {
    if (mood !== "sleepy") {
      insights.push("你现在想做的事情可能是'锦上添花'，不是'最小下一步'。");
    }
  }

  return insights.join(" ");
}

function getSavedMinutes(mood, hardCarryScore) {
  if (mood === "sleepy") return 45;
  if (hardCarryScore >= 9) return 40;
  if (hardCarryScore >= 7) return 25;
  return 15;
}

function isHandoffRecommended(mood, hardCarryScore, clarityScore) {
  return mood === "sleepy" || hardCarryScore >= 8 || clarityScore <= 3;
}

// ============ 规则引擎 ============
export function buildProtocolWithRules({
  mood,
  task,
  hardCarryScore,
  clarityScore,
}) {
  const state = stateMap[mood];
  const handoff = isHandoffRecommended(mood, hardCarryScore, clarityScore);
  const decision = handoff
    ? "休息，并把最小任务交给 Agent"
    : state.decision;
  const savedMinutes = getSavedMinutes(mood, hardCarryScore);
  const minimalNext = handoff
    ? "复制交接 Prompt，让 Agent 只做复现、定位或列出最小修复建议。"
    : state.next;

  const taskInsight = analyzeTask(task, mood);
  const cause = taskInsight
    ? `${state.cause} ${taskInsight}`
    : state.cause;

  return {
    mood,
    moodLabel: state.label,
    task,
    hardCarryScore,
    clarityScore,
    handoff,
    decision,
    reason: cause,
    savedMinutes,
    minimalNext,
    steps: [
      { title: "身体恢复", body: state.body },
      { title: "任务诊断", body: cause },
      {
        title: handoff ? "Agent 接管" : "最小下一步",
        body: minimalNext,
      },
    ],
    prompt: `我现在要${handoff ? "休息 20 分钟" : "执行一次 3 分钟 Reset"}。请你接手下面这个任务，只做最小下一步。\n\n当前任务：\n${task}\n\n当前状态：\n我现在处于「${state.label}」状态，想继续硬扛的冲动是 ${hardCarryScore}/10，清晰度是 ${clarityScore}/10。${taskInsight ? "诊断补充：" + taskInsight : ""}继续扩大范围会降低交付质量。\n\n你的边界：\n1. 只处理最小下一步，不要重构，不要扩展范围。\n2. 优先复现问题、定位入口、列出 3 个可能原因。\n3. 如果需要改代码，只给出 1 个最小修复建议。\n4. 不要改动无关文件。\n5. 输出下一步可以验证的命令或检查点。`,
  };
}

// ============ API 层（预留） ============
function buildSystemPrompt({ mood, task, hardCarryScore, clarityScore }) {
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

export async function buildProtocolWithAPI({
  mood,
  task,
  hardCarryScore,
  clarityScore,
}) {
  if (!CONFIG.API_ENDPOINT) {
    throw new Error("API 端点未配置。请在控制台运行：\n" +
      `updateConfig({ API_ENDPOINT: 'https://your-api.com/v1/chat/completions' })`);
  }
  if (!CONFIG.API_KEY) {
    throw new Error("API 密钥未配置");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt({ mood, task, hardCarryScore, clarityScore }),
          },
          {
            role: "user",
            content: "请生成 Reset 协议。",
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error("API 返回内容为空");
    }

    const content = JSON.parse(raw);
    const handoff = isHandoffRecommended(mood, hardCarryScore, clarityScore);
    const state = stateMap[mood];

    return {
      mood,
      moodLabel: state.label,
      task,
      hardCarryScore,
      clarityScore,
      handoff,
      decision: handoff
        ? "休息，并把最小任务交给 Agent"
        : content.decision || state.decision,
      reason: content.reason || state.cause,
      savedMinutes:
        typeof content.savedMinutes === "number"
          ? content.savedMinutes
          : getSavedMinutes(mood, hardCarryScore),
      minimalNext: handoff
        ? "复制交接 Prompt，让 Agent 只做复现、定位或列出最小修复建议。"
        : content.next || state.next,
      steps: [
        {
          title: "身体恢复",
          body: content.body || state.body,
        },
        {
          title: "任务诊断",
          body: content.reason || state.cause,
        },
        {
          title: handoff ? "Agent 接管" : "最小下一步",
          body: handoff
            ? "复制交接 Prompt，让 Agent 只做复现、定位或列出最小修复建议。"
            : content.next || state.next,
        },
      ],
      prompt: `我现在要${handoff ? "休息 20 分钟" : "执行一次 3 分钟 Reset"}。请你接手下面这个任务，只做最小下一步。\n\n当前任务：\n${task}\n\n当前状态：\n我现在处于「${state.label}」状态，想继续硬扛的冲动是 ${hardCarryScore}/10，清晰度是 ${clarityScore}/10。继续扩大范围会降低交付质量。\n\n你的边界：\n1. 只处理最小下一步，不要重构，不要扩展范围。\n2. 优先复现问题、定位入口、列出 3 个可能原因。\n3. 如果需要改代码，只给出 1 个最小修复建议。\n4. 不要改动无关文件。\n5. 输出下一步可以验证的命令或检查点。`,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ============ 统一入口 ============
export async function buildProtocol(data) {
  if (CONFIG.ENABLE_API && CONFIG.API_ENDPOINT) {
    try {
      return await buildProtocolWithAPI(data);
    } catch (err) {
      console.warn("[ProtocolEngine] API 调用失败，回退到规则引擎:", err);
      if (CONFIG.FALLBACK_ENABLED) {
        return buildProtocolWithRules(data);
      }
      throw err;
    }
  }
  return buildProtocolWithRules(data);
}
