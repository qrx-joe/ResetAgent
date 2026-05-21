const stateMap = {
  stuck: {
    label: "卡住",
    decision: "先降级任务，再继续",
    cause: "你现在的问题更像是任务边界过大，反馈回路太慢。继续硬扛会让修改范围越来越散。",
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
    cause: "你可能在同时满足太多标准：技术、体验、评委印象、提交完整度。",
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
    next: "回来后只做一个无需长时间盯屏的小操作：记录问题、跑测试或提交当前可用版本。",
  },
};

const form = document.querySelector("#diagnosticForm");
const taskInput = document.querySelector("#taskInput");
const hardCarry = document.querySelector("#hardCarry");
const clarity = document.querySelector("#clarity");
const afterClarity = document.querySelector("#afterClarity");
const hardCarryValue = document.querySelector("#hardCarryValue");
const clarityValue = document.querySelector("#clarityValue");
const afterClarityValue = document.querySelector("#afterClarityValue");
const decisionTitle = document.querySelector("#decisionTitle");
const decisionReason = document.querySelector("#decisionReason");
const protocolList = document.querySelector("#protocolList");
const handoffPrompt = document.querySelector("#handoffPrompt");
const copyPrompt = document.querySelector("#copyPrompt");
const quickDemo = document.querySelector("#quickDemo");
const saveSession = document.querySelector("#saveSession");
const cardMood = document.querySelector("#cardMood");
const cardClarity = document.querySelector("#cardClarity");
const cardSaved = document.querySelector("#cardSaved");
const cardNext = document.querySelector("#cardNext");
const toast = document.querySelector("#toast");
const timerRing = document.querySelector("#timerRing");
const timerText = document.querySelector("#timerText");
const startTimer = document.querySelector("#startTimer");
const pauseTimer = document.querySelector("#pauseTimer");
const resetTimer = document.querySelector("#resetTimer");

const totalSeconds = 180;
let secondsLeft = totalSeconds;
let timerId = null;
let currentProtocol = null;

function getSelectedMood() {
  return new FormData(form).get("mood") || "stuck";
}

function syncOutput(input, output) {
  output.value = input.value;
}

function formatTime(total) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTimer() {
  const elapsed = totalSeconds - secondsLeft;
  const degrees = Math.round((elapsed / totalSeconds) * 360);
  timerText.textContent = formatTime(secondsLeft);
  timerRing.style.setProperty("--progress", `${degrees}deg`);
}

function stopTimer() {
  window.clearInterval(timerId);
  timerId = null;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 1600);
}

function isHandoffRecommended(mood, hardCarryScore, clarityScore) {
  return mood === "sleepy" || hardCarryScore >= 8 || clarityScore <= 3;
}

function getSavedMinutes(mood, hardCarryScore) {
  if (mood === "sleepy") return 45;
  if (hardCarryScore >= 9) return 40;
  if (hardCarryScore >= 7) return 25;
  return 15;
}

function buildProtocol({ mood, task, hardCarryScore, clarityScore }) {
  const state = stateMap[mood];
  const handoff = isHandoffRecommended(mood, hardCarryScore, clarityScore);
  const decision = handoff ? "休息，并把最小任务交给 Agent" : state.decision;
  const savedMinutes = getSavedMinutes(mood, hardCarryScore);
  const minimalNext = handoff
    ? "复制交接 Prompt，让 Agent 只做复现、定位或列出最小修复建议。"
    : state.next;

  return {
    mood,
    moodLabel: state.label,
    task,
    hardCarryScore,
    clarityScore,
    handoff,
    decision,
    reason: state.cause,
    savedMinutes,
    minimalNext,
    steps: [
      {
        title: "身体恢复",
        body: state.body,
      },
      {
        title: "任务诊断",
        body: state.cause,
      },
      {
        title: handoff ? "Agent 接管" : "最小下一步",
        body: minimalNext,
      },
    ],
    prompt: `我现在要${handoff ? "休息 20 分钟" : "执行一次 3 分钟 Reset"}。请你接手下面这个任务，只做最小下一步。\n\n当前任务：\n${task}\n\n当前状态：\n我现在处于「${state.label}」状态，想继续硬扛的冲动是 ${hardCarryScore}/10，清晰度是 ${clarityScore}/10。继续扩大范围会降低交付质量。\n\n你的边界：\n1. 只处理最小下一步，不要重构，不要扩展范围。\n2. 优先复现问题、定位入口、列出 3 个可能原因。\n3. 如果需要改代码，只给出 1 个最小修复建议。\n4. 不要改动无关文件。\n5. 输出下一步可以验证的命令或检查点。`,
  };
}

function renderProtocol(protocol) {
  decisionTitle.textContent = protocol.decision;
  decisionReason.textContent = protocol.reason;
  handoffPrompt.value = protocol.prompt;
  protocolList.innerHTML = protocol.steps
    .map(
      (step, index) => `
        <article>
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${step.title}</h3>
            <p>${step.body}</p>
          </div>
        </article>
      `,
    )
    .join("");

  cardMood.textContent = protocol.moodLabel;
  cardClarity.textContent = `${protocol.clarityScore} → ${afterClarity.value}`;
  cardSaved.textContent = `约 ${protocol.savedMinutes} 分钟`;
  cardNext.textContent = protocol.minimalNext;
}

function fillDemo() {
  document.querySelector('input[name="mood"][value="stuck"]').checked = true;
  taskInput.value = "登录页提交后没有跳转，我已经改了 2 小时，越改越乱，不知道该继续查路由还是 API。";
  hardCarry.value = "9";
  clarity.value = "3";
  afterClarity.value = "7";
  syncOutput(hardCarry, hardCarryValue);
  syncOutput(clarity, clarityValue);
  syncOutput(afterClarity, afterClarityValue);
  form.requestSubmit();
}

function saveCurrentSession() {
  if (!currentProtocol) {
    showToast("先生成 Reset 协议");
    return;
  }

  const afterScore = Number(afterClarity.value);
  const session = {
    ...currentProtocol,
    afterScore,
    createdAt: new Date().toISOString(),
  };

  const history = JSON.parse(localStorage.getItem("reset-agent-history") || "[]");
  history.unshift(session);
  localStorage.setItem("reset-agent-history", JSON.stringify(history.slice(0, 12)));

  cardClarity.textContent = `${currentProtocol.clarityScore} → ${afterScore}`;
  cardSaved.textContent = `约 ${currentProtocol.savedMinutes} 分钟`;
  cardNext.textContent = currentProtocol.minimalNext;
  showToast("状态卡片已更新");
}

hardCarry.addEventListener("input", () => syncOutput(hardCarry, hardCarryValue));
clarity.addEventListener("input", () => syncOutput(clarity, clarityValue));
afterClarity.addEventListener("input", () => {
  syncOutput(afterClarity, afterClarityValue);
  if (currentProtocol) {
    cardClarity.textContent = `${currentProtocol.clarityScore} → ${afterClarity.value}`;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const task = taskInput.value.trim();

  if (!task) {
    taskInput.focus();
    showToast("先写下当前任务");
    return;
  }

  currentProtocol = buildProtocol({
    mood: getSelectedMood(),
    task,
    hardCarryScore: Number(hardCarry.value),
    clarityScore: Number(clarity.value),
  });

  renderProtocol(currentProtocol);
  secondsLeft = totalSeconds;
  updateTimer();
  stopTimer();
  showToast("Reset 协议已生成");
});

startTimer.addEventListener("click", () => {
  if (timerId) return;
  timerId = window.setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    updateTimer();
    if (secondsLeft === 0) {
      stopTimer();
      showToast("Reset 完成，验证一下状态");
    }
  }, 1000);
});

pauseTimer.addEventListener("click", stopTimer);

resetTimer.addEventListener("click", () => {
  stopTimer();
  secondsLeft = totalSeconds;
  updateTimer();
});

copyPrompt.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(handoffPrompt.value);
    showToast("已复制交接 Prompt");
  } catch {
    handoffPrompt.select();
    document.execCommand("copy");
    showToast("已复制交接 Prompt");
  }
});

quickDemo.addEventListener("click", fillDemo);
saveSession.addEventListener("click", saveCurrentSession);

updateTimer();

if (new URLSearchParams(window.location.search).get("demo") === "1") {
  fillDemo();
}
