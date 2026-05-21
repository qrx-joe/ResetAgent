import { buildProtocol } from "./js/protocol-engine.js";

// ============ DOM 引用 ============
const $ = (sel) => document.querySelector(sel);

const DOM = {
  form: $("#diagnosticForm"),
  taskInput: $("#taskInput"),
  hardCarry: $("#hardCarry"),
  clarity: $("#clarity"),
  afterClarity: $("#afterClarity"),
  hardCarryValue: $("#hardCarryValue"),
  clarityValue: $("#clarityValue"),
  afterClarityValue: $("#afterClarityValue"),
  decisionTitle: $("#decisionTitle"),
  decisionReason: $("#decisionReason"),
  sourceBadge: $("#sourceBadge"),
  protocolList: $("#protocolList"),
  handoffPrompt: $("#handoffPrompt"),
  copyPrompt: $("#copyPrompt"),
  quickDemo: $("#quickDemo"),
  saveSession: $("#saveSession"),
  cardMood: $("#cardMood"),
  cardClarity: $("#cardClarity"),
  cardSaved: $("#cardSaved"),
  cardNext: $("#cardNext"),
  toast: $("#toast"),
  timerRing: $("#timerRing"),
  timerText: $("#timerText"),
  startTimer: $("#startTimer"),
  pauseTimer: $("#pauseTimer"),
  resetTimer: $("#resetTimer"),
  submitBtn: $("#diagnosticForm button[type='submit']"),
  // loading indicator (will be injected if missing)
};

// ============ 状态 ============
let currentProtocol = null;

// ============ 计时器 ============
const Timer = {
  TOTAL_SECONDS: 180,
  secondsLeft: 180,
  timerId: null,

  format(total) {
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  },

  update() {
    const elapsed = this.TOTAL_SECONDS - this.secondsLeft;
    const degrees = Math.round((elapsed / this.TOTAL_SECONDS) * 360);
    DOM.timerText.textContent = this.format(this.secondsLeft);
    DOM.timerRing.style.setProperty("--progress", `${degrees}deg`);
  },

  start() {
    if (this.timerId) return;
    this.timerId = window.setInterval(() => {
      this.secondsLeft = Math.max(0, this.secondsLeft - 1);
      this.update();
      if (this.secondsLeft === 0) {
        this.stop();
        Toast.show("Reset 完成，验证一下状态");
      }
    }, 1000);
  },

  stop() {
    window.clearInterval(this.timerId);
    this.timerId = null;
  },

  reset() {
    this.stop();
    this.secondsLeft = this.TOTAL_SECONDS;
    this.update();
  },
};

// ============ Toast ============
const Toast = {
  show(message) {
    DOM.toast.textContent = message;
    DOM.toast.classList.add("is-visible");
    window.setTimeout(() => DOM.toast.classList.remove("is-visible"), 1600);
  },
};

// ============ Loading ============
const Loading = {
  _indicator: null,

  ensure() {
    if (this._indicator) return this._indicator;
    const el = document.createElement("div");
    el.id = "loadingIndicator";
    el.className = "loading-indicator";
    el.innerHTML = `
      <span class="loading-spinner"></span>
      <span class="loading-text">生成协议中...</span>
    `;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    DOM.submitBtn.parentElement.appendChild(el);
    this._indicator = el;
    return el;
  },

  show() {
    const el = this.ensure();
    el.classList.add("is-visible");
    DOM.submitBtn.disabled = true;
    DOM.submitBtn.textContent = "生成中...";
  },

  hide() {
    const el = this._indicator;
    if (el) el.classList.remove("is-visible");
    DOM.submitBtn.disabled = false;
    DOM.submitBtn.textContent = "生成协议";
  },
};

// ============ 存储 ============
const Storage = {
  KEY: "reset-agent-history",
  MAX: 12,

  save(session) {
    const history = this.load();
    history.unshift(session);
    localStorage.setItem(this.KEY, JSON.stringify(history.slice(0, this.MAX)));
  },

  load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || "[]");
    } catch {
      return [];
    }
  },
};

// ============ 工具函数 ============
function getSelectedMood() {
  return new FormData(DOM.form).get("mood") || "stuck";
}

function syncOutput(input, output) {
  output.value = input.value;
}

// ============ 协议渲染 ============
function renderProtocol(protocol) {
  DOM.decisionTitle.textContent = protocol.decision;
  DOM.decisionReason.textContent = protocol.reason;
  DOM.handoffPrompt.value = protocol.prompt;
  if (DOM.sourceBadge) {
    const isLlm = protocol.source === "llm";
    DOM.sourceBadge.textContent = isLlm ? "LLM" : "Fallback";
    DOM.sourceBadge.classList.toggle("is-llm", isLlm);
  }

  DOM.protocolList.innerHTML = protocol.steps
    .map(
      (step, i) => `
        <article>
          <span>${String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3>${step.title}</h3>
            <p>${step.body}</p>
          </div>
        </article>
      `
    )
    .join("");

  DOM.cardMood.textContent = protocol.moodLabel;
  DOM.cardClarity.textContent = `${protocol.clarityScore} → ${DOM.afterClarity.value}`;
  DOM.cardSaved.textContent = `约 ${protocol.savedMinutes} 分钟`;
  DOM.cardNext.textContent = protocol.minimalNext;
}

// ============ Demo 数据 ============
function fillDemo() {
  const moodInput = document.querySelector('input[name="mood"][value="stuck"]');
  if (moodInput) moodInput.checked = true;

  DOM.taskInput.value =
    "登录页提交后没有跳转，我已经改了 2 小时，越改越乱，不知道该继续查路由还是 API。";
  DOM.hardCarry.value = "9";
  DOM.clarity.value = "3";
  DOM.afterClarity.value = "7";
  syncOutput(DOM.hardCarry, DOM.hardCarryValue);
  syncOutput(DOM.clarity, DOM.clarityValue);
  syncOutput(DOM.afterClarity, DOM.afterClarityValue);
  DOM.form.requestSubmit();
}

// ============ 保存会话 ============
function saveCurrentSession() {
  if (!currentProtocol) {
    Toast.show("先生成 Reset 协议");
    return;
  }

  const afterScore = Number(DOM.afterClarity.value);
  const session = {
    ...currentProtocol,
    afterScore,
    createdAt: new Date().toISOString(),
  };

  Storage.save(session);

  DOM.cardClarity.textContent = `${currentProtocol.clarityScore} → ${afterScore}`;
  DOM.cardSaved.textContent = `约 ${currentProtocol.savedMinutes} 分钟`;
  DOM.cardNext.textContent = currentProtocol.minimalNext;
  Toast.show("状态卡片已更新");
}

// ============ 核心：生成协议 ============
async function handleSubmit(event) {
  event.preventDefault();

  const task = DOM.taskInput.value.trim();
  if (!task) {
    DOM.taskInput.focus();
    Toast.show("先写下当前任务");
    return;
  }

  Loading.show();

  try {
    currentProtocol = await buildProtocol({
      mood: getSelectedMood(),
      task,
      hardCarryScore: Number(DOM.hardCarry.value),
      clarityScore: Number(DOM.clarity.value),
    });

    renderProtocol(currentProtocol);
    Timer.reset();
    Toast.show("Reset 协议已生成");
  } catch (err) {
    console.error("[App] 生成协议失败:", err);

    let message = "生成失败，请重试";
    const msg = err.message || "";
    if (msg.startsWith("CONFIG_ERROR")) {
      message = "API 未配置，已使用本地规则引擎";
    } else if (msg.startsWith("API_ERROR")) {
      message = "服务暂时不可用，已使用本地规则引擎";
    } else if (err.name === "AbortError" || msg.includes("fetch") || msg.includes("network")) {
      message = "网络不稳定，已使用本地规则引擎";
    }

    Toast.show(message);
  } finally {
    Loading.hide();
  }
}

// ============ 复制 Prompt ============
async function copyHandoffPrompt() {
  try {
    await navigator.clipboard.writeText(DOM.handoffPrompt.value);
    Toast.show("已复制交接 Prompt");
  } catch {
    DOM.handoffPrompt.select();
    document.execCommand("copy");
    Toast.show("已复制交接 Prompt");
  }
}

// ============ 事件绑定 ============
function bindEvents() {
  DOM.hardCarry.addEventListener("input", () =>
    syncOutput(DOM.hardCarry, DOM.hardCarryValue)
  );
  DOM.clarity.addEventListener("input", () =>
    syncOutput(DOM.clarity, DOM.clarityValue)
  );
  DOM.afterClarity.addEventListener("input", () => {
    syncOutput(DOM.afterClarity, DOM.afterClarityValue);
    if (currentProtocol) {
      DOM.cardClarity.textContent = `${currentProtocol.clarityScore} → ${DOM.afterClarity.value}`;
    }
  });

  DOM.form.addEventListener("submit", handleSubmit);
  DOM.startTimer.addEventListener("click", () => Timer.start());
  DOM.pauseTimer.addEventListener("click", () => Timer.stop());
  DOM.resetTimer.addEventListener("click", () => Timer.reset());
  DOM.copyPrompt.addEventListener("click", copyHandoffPrompt);
  DOM.quickDemo.addEventListener("click", fillDemo);
  DOM.saveSession.addEventListener("click", saveCurrentSession);
}

// ============ 初始化 ============
function init() {
  bindEvents();
  Timer.update();

  if (new URLSearchParams(window.location.search).get("demo") === "1") {
    fillDemo();
  }
}

init();
