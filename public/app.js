import { buildProtocol } from "./js/protocol-engine.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const DOM = {
  statusText: $("#statusPill span:last-child"),
  pages: $$("[data-page]"),
  progressSteps: $$(".progress-step"),
  moodOptions: $$(".mood-option"),
  segmentGroups: $$(".segmented"),
  templateButtons: $$(".template-chip"),
  stateSummary: $("#stateSummary"),
  taskInput: $("#taskInput"),
  charCount: $("#charCount"),
  sourceBadge: $("#sourceBadge"),
  saveState: $("#saveState"),
  generateReset: $("#generateReset"),
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
  restartFlow: $("#restartFlow"),
  settingsButton: $("#settingsButton"),
  summaryMood: $("#summaryMood"),
  summaryDecision: $("#summaryDecision"),
  summarySaved: $("#summarySaved"),
  toast: $("#toast"),
};

const MOOD_CONFIG = {
  stuck: { label: "卡住", status: "卡住", hint: "先缩小任务边界" },
  tired: { label: "疲惫", status: "中等疲劳", hint: "先恢复判断力" },
  anxious: { label: "焦虑", status: "焦虑偏高", hint: "先收窄 Demo 面" },
  sleepy: { label: "困倦", status: "困倦", hint: "建议交给 Agent" },
  pain: { label: "疼痛", status: "身体报警", hint: "先解除身体警报" },
};

const VALUE_LABELS = {
  3: "低",
  6: "中",
  9: "高",
};

const DEFAULT_PROMPT =
  "完成状态填写和卡点描述后，这里会生成可复制给 Codex / Cursor / Claude Code 的交接 Prompt。";

let currentPage = 1;
let maxVisitedPage = 1;
let selectedMood = null;
let hardCarryScore = null;
let clarityScore = null;
let currentProtocol = null;

const Timer = {
  totalSeconds: 180,
  secondsLeft: 180,
  timerId: null,
  isRunning: false,

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

  renderControls() {
    DOM.startTimer.classList.toggle("is-primary", !this.isRunning);
    DOM.pauseTimer.classList.toggle("is-primary", this.isRunning);
    DOM.startTimer.disabled = this.isRunning;
    DOM.pauseTimer.disabled = !this.isRunning;
    DOM.startTimer.setAttribute("aria-pressed", String(this.isRunning));
    DOM.pauseTimer.setAttribute("aria-pressed", String(this.isRunning));
  },

  start() {
    if (this.timerId) return;
    this.isRunning = true;
    DOM.timerHint.textContent = "专注呼吸";
    this.renderControls();
    this.timerId = window.setInterval(() => {
      this.secondsLeft = Math.max(0, this.secondsLeft - 1);
      this.render();
      if (this.secondsLeft === 120) DOM.timerHint.textContent = "压缩任务";
      if (this.secondsLeft === 60) DOM.timerHint.textContent = "准备交接";
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
    this.isRunning = false;
    this.renderControls();
  },

  reset() {
    this.stop();
    this.secondsLeft = this.totalSeconds;
    DOM.timerHint.textContent = "专注呼吸";
    this.render();
    this.renderControls();
  },
};

const Toast = {
  show(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.add("is-visible");
    window.setTimeout(() => DOM.toast.classList.remove("is-visible"), 1700);
  },
};

function goToPage(page) {
  currentPage = Math.max(1, Math.min(4, page));
  maxVisitedPage = Math.max(maxVisitedPage, currentPage);

  DOM.pages.forEach((panel) => {
    panel.classList.toggle("is-active", Number(panel.dataset.page) === currentPage);
  });

  DOM.progressSteps.forEach((step) => {
    const value = Number(step.dataset.jumpPage);
    step.classList.toggle("is-active", value === currentPage);
    step.classList.toggle("is-complete", value < currentPage);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateStatus(extra = "") {
  const mood = selectedMood ? MOOD_CONFIG[selectedMood] : null;
  DOM.statusText.textContent = extra || `当前状态：${mood ? mood.status : "待填写"}`;
  DOM.handoffHint.textContent =
    !mood || hardCarryScore == null || clarityScore == null
      ? "完成状态填写后，再决定是否交接。"
      : hardCarryScore >= 9 || clarityScore <= 3 || selectedMood === "sleepy"
        ? "建议交给 Agent，别继续硬扛。"
        : `${mood.hint} · 硬扛 ${VALUE_LABELS[hardCarryScore]} · 清晰度 ${VALUE_LABELS[clarityScore]}`;
  renderStateSummary();
}

function renderStateSummary() {
  DOM.stateSummary.replaceChildren(
    createChip(selectedMood ? MOOD_CONFIG[selectedMood].label : "心情 未选"),
    createChip(`硬扛 ${hardCarryScore == null ? "未选" : VALUE_LABELS[hardCarryScore]}`),
    createChip(`清晰度 ${clarityScore == null ? "未选" : VALUE_LABELS[clarityScore]}`)
  );
  DOM.summaryMood.textContent = selectedMood ? MOOD_CONFIG[selectedMood].label : "未填写";
}

function createChip(text) {
  const chip = document.createElement("span");
  chip.textContent = text;
  return chip;
}

function selectMood(mood) {
  selectedMood = mood;
  DOM.moodOptions.forEach((button) => {
    const selected = button.dataset.mood === mood;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateStatus();
}

function setControlValue(controlName, value) {
  if (controlName === "hardCarryScore") hardCarryScore = value;
  if (controlName === "clarityScore") clarityScore = value;
  updateStatus();
}

function bindMoodOptions() {
  DOM.moodOptions.forEach((button) => {
    button.addEventListener("click", () => selectMood(button.dataset.mood));
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
  });
}

function syncSegments() {
  DOM.segmentGroups.forEach((group) => {
    const controlName = group.dataset.control;
    const currentValue = controlName === "hardCarryScore" ? hardCarryScore : clarityScore;
    group.querySelectorAll("button").forEach((item) => {
      item.classList.toggle("is-selected", Number(item.dataset.value) === currentValue);
    });
  });
}

function isStateComplete() {
  return selectedMood != null && hardCarryScore != null && clarityScore != null;
}

function validateState() {
  if (!selectedMood) {
    Toast.show("先选择当前心情");
    return false;
  }
  if (hardCarryScore == null) {
    Toast.show("先选择硬扛冲动");
    return false;
  }
  if (clarityScore == null) {
    Toast.show("先选择清晰度");
    return false;
  }
  return true;
}

function createProtocolItem(step, index) {
  const article = document.createElement("article");
  const number = document.createElement("span");
  const content = document.createElement("div");
  const title = document.createElement("h3");
  const body = document.createElement("p");

  number.textContent = String(index + 1);
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
  DOM.sourceBadge.textContent = protocol.source === "llm" ? "LLM 已生成" : "本地规则兜底";

  DOM.protocolList.replaceChildren(
    ...(protocol.steps || []).map((step, index) => createProtocolItem(step, index))
  );

  DOM.handoffPrompt.textContent = formatPrompt(protocol);
  DOM.summaryDecision.textContent = protocol.handoff ? "建议交接" : "最小行动";
  DOM.summarySaved.textContent = `约 ${protocol.savedMinutes || 25} 分钟`;
  updateStatus(`当前状态：${protocol.moodLabel || MOOD_CONFIG[selectedMood]?.status || "已填写"}`);
  Timer.reset();
}

function getTaskText() {
  return DOM.taskInput.value.trim();
}

function setTaskText(value) {
  DOM.taskInput.value = value;
  updateCharCount();
}

function updateCharCount() {
  DOM.charCount.textContent = String(DOM.taskInput.value.length);
}

function appendTemplate(button) {
  const template = button.dataset.template || "";
  const current = DOM.taskInput.value.trim();
  const separator = current ? "\n" : "";
  const maxLength = Number(DOM.taskInput.maxLength || 300);
  let nextValue = `${current}${separator}${template}`;
  let message = button.dataset.toast || "模板已追加";

  if (nextValue.length > maxLength) {
    nextValue = nextValue.slice(0, maxLength);
    message = "已追加模板，内容接近上限";
  }

  setTaskText(nextValue);
  DOM.sourceBadge.textContent = "模板已追加";
  DOM.taskInput.focus();
  Toast.show(message);
}

function saveState() {
  if (!validateState()) return;
  updateStatus();
  Toast.show("状态已保存");
  goToPage(2);
  window.setTimeout(() => DOM.taskInput.focus(), 160);
}

async function generateReset() {
  if (!validateState()) {
    goToPage(1);
    return;
  }

  const task = getTaskText();
  if (!task) {
    goToPage(2);
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
    goToPage(3);
  } catch (error) {
    console.error("[Reset Agent] 生成失败:", error);
    DOM.sourceBadge.textContent = "生成失败";
    updateStatus();
    Toast.show("生成失败，请稍后再试");
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

function restartFlow() {
  currentProtocol = null;
  selectedMood = null;
  hardCarryScore = null;
  clarityScore = null;
  maxVisitedPage = 1;
  setTaskText("");
  DOM.sourceBadge.textContent = "等待输入";
  DOM.decisionTitle.textContent = "先生成你的 Reset 协议";
  DOM.handoffPrompt.textContent = DEFAULT_PROMPT;
  DOM.summaryDecision.textContent = "等待生成";
  DOM.summarySaved.textContent = "约 25 分钟";
  DOM.moodOptions.forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  });
  syncSegments();
  updateStatus();
  Timer.reset();
  goToPage(1);
}

function hydrateDemoIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "auto") return;

  selectMood("tired");
  hardCarryScore = 6;
  clarityScore = 6;
  syncSegments();
  setTaskText("登录页改了 5 次还不满意，越改越乱，已经卡了 2 小时，不想再硬撑了。");
  renderStateSummary();
  goToPage(2);
  window.setTimeout(generateReset, 350);
}

function bindEvents() {
  bindMoodOptions();
  bindSegments();

  DOM.saveState.addEventListener("click", saveState);
  DOM.generateReset.addEventListener("click", generateReset);
  DOM.copyPrompt.addEventListener("click", copyPrompt);
  DOM.handoffCta.addEventListener("click", () => goToPage(4));
  DOM.restartFlow.addEventListener("click", restartFlow);
  DOM.startTimer.addEventListener("click", Timer.start.bind(Timer));
  DOM.pauseTimer.addEventListener("click", Timer.stop.bind(Timer));
  DOM.resetTimer.addEventListener("click", Timer.reset.bind(Timer));
  DOM.settingsButton.addEventListener("click", () => Toast.show("自动演示：在地址后加 ?demo=auto"));

  $$(".hint-button").forEach((button) => {
    button.addEventListener("click", () => Toast.show(button.dataset.hint));
  });

  DOM.templateButtons.forEach((button) => {
    button.addEventListener("click", () => appendTemplate(button));
  });

  $$("[data-next-page]").forEach((button) => {
    button.addEventListener("click", () => goToPage(Number(button.dataset.nextPage)));
  });

  $$("[data-back-page]").forEach((button) => {
    button.addEventListener("click", () => goToPage(Number(button.dataset.backPage)));
  });

  DOM.progressSteps.forEach((button) => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.jumpPage);
      if (page <= maxVisitedPage || currentProtocol) {
        goToPage(page);
      } else {
        Toast.show("先完成当前步骤");
      }
    });
  });

  DOM.taskInput.addEventListener("input", () => {
    updateCharCount();
  });

  DOM.taskInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      generateReset();
    }
  });
}

function init() {
  bindEvents();
  updateStatus();
  Timer.render();
  Timer.renderControls();
  goToPage(1);
  hydrateDemoIfNeeded();
}

init();
