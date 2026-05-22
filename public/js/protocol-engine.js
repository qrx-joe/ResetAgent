/**
 * Protocol Engine
 * 负责生成 Reset 协议。
 *
 * 双模式：
 * 1. 后端 API 模式（优先）：调用 /api/reset，密钥藏在服务端
 * 2. 规则引擎（fallback）：本地零依赖，无网络或后端不可用时兜底
 */

// ============ 配置 ============
export const CONFIG = {
  API_ENDPOINT: "/api/reset",
  ENABLE_API: true,
  FALLBACK_ENABLED: true,
  TIMEOUT_MS: 12000,
};

export function updateConfig(updates) {
  Object.assign(CONFIG, updates);
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

// ============ 启发式分析 ============
function analyzeTask(task, mood) {
  const t = task.toLowerCase();
  const insights = [];

  if (task.length > 80 && mood === "stuck") {
    insights.push("任务描述较长，建议先把它压缩成一句话的核心问题。");
  }

  if (/bug|报错|错误|exception|error|crash|fail|崩|broken|not working|hangs|frozen|issue|problem/.test(t)) {
    if (mood === "tired") {
      insights.push("疲劳时调试容易越改越乱，建议先恢复再定位。");
    } else if (mood === "stuck") {
      insights.push("遇到报错卡住时，先隔离最小复现场景比全面排查更有效。");
    }
  }

  if (/不知道|不清楚|迷茫|无从下手|不知道从哪里|怎么开始|don't know|no idea|how to start|where to start|confused/.test(t)) {
    insights.push("你对任务缺乏清晰起点，这说明需要先做任务降级。");
  }

  if (/小时|hour|deadline|截止|来不及|时间不够|running out of time|out of time/.test(t)) {
    insights.push("时间压力正在放大当前状态，先停下来反而能缩短总耗时。");
  }

  if (/demo|展示|答辩|present|judge|评委/.test(t) && mood === "anxious") {
    insights.push("Demo 焦虑是黑客松常态，把展示目标砍到只剩一个核心故事。");
  }

  if (/重构|重写|优化|改进|升级|better|refactor|rewrite|rebuild|improve|optimize/.test(t)) {
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

function buildExecutionSteps(task, minimalNext) {
  return [
    {
      title: "复述卡点",
      body: `把问题压缩成一句可验证描述：${task}`,
    },
    {
      title: "隔离变量",
      body: "只保留一个最可能相关的页面、接口或文件，暂停新增功能和视觉微调。",
    },
    {
      title: "执行验证",
      body: minimalNext,
    },
  ];
}

function buildAgentPrompt({
  task,
  stateLabel,
  hardCarryScore,
  clarityScore,
  cause,
  minimalNext,
  executionSteps,
}) {
  const steps = executionSteps
    .map((step, index) => `${index + 1}. ${step.title}：${step.body}`)
    .join("\n");

  return `【目标】
接手下面这个开发卡点，并完成一个可验证的最小下一步。

【当前卡点】
${task}

【状态】
- 当前状态：${stateLabel}
- 硬扛冲动：${hardCarryScore}/10
- 清晰度：${clarityScore}/10

【卡点判断】
${cause}

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
  const executionSteps = buildExecutionSteps(task, minimalNext);

  const taskInsight = analyzeTask(task, mood);
  const cause = taskInsight
    ? `${state.cause} ${taskInsight}`
    : state.cause;

  return {
    source: "rules",
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
      { title: "卡点判断", body: cause },
      ...executionSteps,
    ],
    prompt: buildAgentPrompt({
      task,
      stateLabel: state.label,
      hardCarryScore,
      clarityScore,
      cause,
      minimalNext,
      executionSteps,
    }),
  };
}

// ============ 后端 API 调用 ============
export async function buildProtocolWithAPI({
  mood,
  task,
  hardCarryScore,
  clarityScore,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mood,
        task,
        hardCarryScore,
        clarityScore,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || `HTTP ${response.status}`;
      throw new Error(`API_ERROR: ${errorMsg}`);
    }

    const protocol = await response.json();
    return { ...protocol, source: protocol.source || "llm" };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ============ 统一入口 ============
export async function buildProtocol(data) {
  if (CONFIG.ENABLE_API) {
    try {
      return await buildProtocolWithAPI(data);
    } catch (err) {
      console.warn("[ProtocolEngine] 后端 API 调用失败，回退到规则引擎:", err);
      if (CONFIG.FALLBACK_ENABLED) {
        return buildProtocolWithRules(data);
      }
      throw err;
    }
  }
  return buildProtocolWithRules(data);
}
