import { buildProtocol } from "./js/protocol-engine.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const DOM = {
  statusPill: $("#statusPill span:last-child"),
  moodOptions: $$(".mood-option"),
  segmentGroups: $$(".segmented"),
  taskInput: $("#taskInput"),
  charCount: $("#charCount"),
  saveState: $("#saveState"),
  saveNote: $("#saveNote"),
  generateReset: $("#generateReset"),
  sourceBadge: $("#sourceBadge"),
  decisionTitle: $("#decisionTitle"),
  etaPill: $("#etaPill"),
  protocolList: $("#protocolList"),
  timerRing: $("#timerRing"),
  timerValue: $("#timerValue"),
  timerHint: $("#timerHint"),
  startTimer: $("#startTimer"),
  pauseTimer: $("#pauseTimer"),
  resetTimer: $("#resetTimer"),
  handoffCta: $("#handoffCta"),
  handoffHint: $("#handoffHint"),
  handoffPrompt: $("#handoffPrompt"),
  copyPrompt: $("#copyPrompt"),
  settingsButton: $("#settingsButton"),
  toast: $("#toast"),
  progressSteps: $$(".progress-step"),
  panels: $$("[data-step-panel]"),
};

const MOOD_CONFIG = {
  stuck: { label: "卡住", status: "卡住", hint: "先缩小任务边界" },
  tired: { label: "疲惫", status: "中等疲劳", hint: "先恢复判断力" },
  anxious: { label: "焦虑", status: "焦虑偏高", hint: "先收窄 Demo 面" },
  sleepy: { label: "困倦", status: "困倦", hint: "建议交给 Agent" },
  pain: { label: "疼痛", status: "身体报警", hint: "先解除身体警报" },
};

const CONTROL_LABELS = {
  hardCarryScore: {
    3: "低",
    6: "中",
    9: "高",
  },
  clarityScore: {
    3: "低",
    6: "中",
    9: "高",
  },
};

const DEFAULT_PROMPT = `1  背景：我正在处理一个开发任务，已经出现疲惫和硬扛倾向。
2  目标：让页面更简洁清晰，聚焦核心信息，减少视觉噪音。
3  限制：保持现有技术栈，不改动后端接口。
4  交付：给出 3 种可执行的页面布局方案，并说明优缺点。`;

let selectedMood = "tired";
let hardCarryScore = 6;
let clarityScore = 6;
let currentProtocol = null;

const Timer = {
  totalSeconds: 180,
  secondsLeft: 180,
  timerId: null,

  format(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const rest = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  },

  render() {
    const progress = Math.max(0, (this.secondsLeft / this.totalSeconds) * 100);
    DOM.timerValue.textContent = this.format(this.secondsLeft);
    DOM.timerRing.style.setProperty("--timer-progress", progress.toFixed(2));
  },

  start() {
    if (this.timerId) return;
    DOM.timerHint.textContent = "专注呼吸";
    this.timerId = window.setInterval(() => {
      this.secondsLeft = Math.max(0, this.secondsLeft - 1);
      this.render();

      if (this.secondsLeft === 120) DOM.timerHint.textContent = "压缩任务";
      if (this.secondsLeft === 60) DOM.timerHint.textContent = "准备接管";
      if (this.secondsLeft === 0) {
        this.stop();
        DOM.timerHint.textContent = "Reset 完成";
        Toast.show("3 分钟 Reset 完成");
      }
    }, 1000);
  },

  stop() {
    window.clearInterval(this.timerId);
    this.timerId = null;
  },

  reset() {
    this.stop();
    this.secondsLeft = this.totalSeconds;
    DOM.timerHint.textContent = "专注呼吸";
    this.render();
  },
};

const Toast = {
  show(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.add("is-visible");
    window.setTimeout(() => DOM.toast.classList.remove("is-visible"), 1800);
  },
};

function getControlValue(controlName) {
  return controlName === "hardCarryScore" ? hardCarryScore : clarityScore;
}

function setControlValue(controlName, value) {
  if (controlName === "hardCarryScore") hardCarryScore = value;
  if (controlName === "clarityScore") clarityScore = value;
  updateStatus();
}

function updateStatus(extra = "") {
  const mood = MOOD_CONFIG[selectedMood] || MOOD_CONFIG.tired;
  const hard = CONTROL_LABELS.hardCarryScore[hardCarryScore];
  const clarity = CONTROL_LABELS.clarityScore[clarityScore];
  DOM.statusPill.textContent = extra || `当前状态：${mood.status}`;
  DOM.handoffHint.textContent =
    hardCarryScore >= 9 || clarityScore <= 3 || selectedMood === "sleepy"
      ? "你专注当下，重复的交给 Agent。"
      : `${mood.hint} · 硬扛 ${hard} · 清晰度 ${clarity}`;
}

function setActiveStep(step) {
  DOM.progressSteps.forEach((item) => {
    const value = Number(item.dataset.jumpStep);
    item.classList.toggle("is-active", value === step);
    item.classList.toggle("is-complete", value < step);
  });

  DOM.panels.forEach((panel) => {
    const value = Number(panel.dataset.stepPanel);
    panel.classList.toggle("is-open", value === step || window.innerWidth > 760);
  });
}

function selectMood(mood) {
  selectedMood = mood;
  DOM.moodOptions.forEach((button) => {
    const isSelected = button.dataset.mood === mood;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  updateStatus();
}

function bindMoodOptions() {
  DOM.moodOptions.forEach((button) => {
    button.addEventListener("click", () => {
      selectMood(button.dataset.mood);
    });
  });
}

function bindSegments() {
  DOM.segmentGroups.forEach((group) => {
    const controlName = group.dataset.control;
    group.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const value = Number(button.dataset.value);
        setControlValue(controlName, value);
        group.querySelectorAll("button").forEach((item) => {
          item.classList.toggle("is-selected", Number(item.dataset.value) === value);
        });
      });
    });

    group.querySelectorAll("button").forEach((item) => {
      item.classList.toggle(
        "is-selected",
        Number(item.dataset.value) === getControlValue(controlName)
      );
    });
  });
}

function createProtocolItem(step, index) {
  const article = document.createElement("article");

  const number = document.createElement("span");
  number.textContent = String(index + 1);

  const content = document.createElement("div");
  const title = document.createElement("h3");
  const body = document.createElement("p");

  title.textContent = step.title;
  body.textContent = step.body;

  content.append(title, body);
  article.append(number, content);
  return article;
}

function formatPrompt(protocol) {
  if (!protocol?.prompt) return DEFAULT_PROMPT;

  return protocol.prompt
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(2, " ")}  ${line}`)
    .join("\n");
}

function renderProtocol(protocol) {
  currentProtocol = protocol;

  DOM.decisionTitle.textContent = protocol.decision || "先恢复，再行动";
  DOM.etaPill.textContent = `预计 ${protocol.savedMinutes || 25} 分钟`;
  DOM.sourceBadge.textContent =
    protocol.source === "llm" ? "LLM 已生成" : "本地规则兜底";

  DOM.protocolList.replaceChildren(
    ...(protocol.steps || []).map((step, index) => createProtocolItem(step, index))
  );

  DOM.handoffPrompt.textContent = formatPrompt(protocol);
  DOM.handoffHint.textContent = protocol.handoff
    ? "建议交给 Agent，别继续硬扛。"
    : "保留边界，完成最小下一步。";

  updateStatus(`当前状态：${protocol.moodLabel || MOOD_CONFIG[selectedMood].status}`);
  setActiveStep(3);
  Timer.reset();
}

function getTaskText() {
  return DOM.taskInput.value.trim();
}

function saveState() {
  updateStatus();
  DOM.saveNote.textContent = "状态已保存在本地";
  Toast.show("状态已保存");
  setActiveStep(2);
  DOM.taskInput.focus();
}

async function generateReset() {
  const task = getTaskText();

  if (!task) {
    setActiveStep(2);
    DOM.taskInput.focus();
    Toast.show("先写下你现在卡在哪里");
    return;
  }

  DOM.generateReset.disabled = true;
  DOM.generateReset.textContent = "生成中...";
  DOM.sourceBadge.textContent = "Agent 思考中";
  updateStatus("当前状态：生成协议中");

  try {
    const protocol = await buildProtocol({
      mood: selectedMood,
      task,
      hardCarryScore,
      clarityScore,
    });
    renderProtocol(protocol);
    Toast.show(protocol.source === "llm" ? "LLM 协议已生成" : "已使用本地规则兜底");
  } catch (error) {
    console.error("[Reset Agent] 生成失败:", error);
    DOM.sourceBadge.textContent = "生成失败";
    Toast.show("生成失败，请稍后再试");
    updateStatus();
  } finally {
    DOM.generateReset.disabled = false;
    DOM.generateReset.textContent = "生成 Reset 协议";
  }
}

async function copyPrompt() {
  const content = DOM.handoffPrompt.textContent.trim();

  try {
    await navigator.clipboard.writeText(content);
    Toast.show("交接 Prompt 已复制");
  } catch {
    const range = document.createRange();
    range.selectNodeContents(DOM.handoffPrompt);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
    Toast.show("交接 Prompt 已复制");
  }
}

function bindPanelToggles() {
  $$("[data-toggle-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveStep(Number(button.dataset.togglePanel));
    });
  });

  DOM.progressSteps.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveStep(Number(button.dataset.jumpStep));
    });
  });
}

function bindHints() {
  $$(".hint-button").forEach((button) => {
    button.addEventListener("click", () => Toast.show(button.dataset.hint));
  });
}

function hydrateDemoIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("demo")) return;

  selectMood("tired");
  hardCarryScore = 6;
  clarityScore = 6;
  DOM.taskInput.value =
    "登录页改了 5 次还不满意，越改越乱，已经卡了 2 小时，不想再硬撑了。";
  DOM.charCount.textContent = String(DOM.taskInput.value.length);
  bindSegments();
  window.setTimeout(generateReset, 350);
}

function bindEvents() {
  bindMoodOptions();
  bindSegments();
  bindPanelToggles();
  bindHints();

  DOM.saveState.addEventListener("click", saveState);
  DOM.generateReset.addEventListener("click", generateReset);
  DOM.copyPrompt.addEventListener("click", copyPrompt);
  DOM.handoffCta.addEventListener("click", copyPrompt);
  DOM.startTimer.addEventListener("click", Timer.start.bind(Timer));
  DOM.pauseTimer.addEventListener("click", Timer.stop.bind(Timer));
  DOM.resetTimer.addEventListener("click", Timer.reset.bind(Timer));
  DOM.settingsButton.addEventListener("click", () => Toast.show("Demo 模式：在地址后加 ?demo=1"));

  DOM.taskInput.addEventListener("input", () => {
    DOM.charCount.textContent = String(DOM.taskInput.value.length);
  });

  DOM.taskInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      generateReset();
    }
  });

  window.addEventListener("resize", () => {
    const active = DOM.progressSteps.find((item) => item.classList.contains("is-active"));
    setActiveStep(Number(active?.dataset.jumpStep || 1));
  });
}

function init() {
  bindEvents();
  selectMood(selectedMood);
  Timer.render();
  setActiveStep(1);
  hydrateDemoIfNeeded();
}

init();
