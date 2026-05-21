import { buildProtocol } from "./js/protocol-engine.js";

// ============ DOM 引用 ============
const $ = (sel) => document.querySelector(sel);

const DOM = {
  screen1: $("#screen1"),
  screen2: $("#screen2"),
  screen3: $("#screen3"),
  moodBtns: document.querySelectorAll(".mood-btn"),
  taskInput: $("#taskInput"),
  startReset: $("#startReset"),
  timerDisplay: $("#timerDisplay"),
  decisionTitle: $("#decisionTitle"),
  decisionReason: $("#decisionReason"),
  protocolList: $("#protocolList"),
  handoffPrompt: $("#handoffPrompt"),
  copyPrompt: $("#copyPrompt"),
  cardMood: $("#cardMood"),
  cardClarity: $("#cardClarity"),
  cardSaved: $("#cardSaved"),
  cardNext: $("#cardNext"),
  backToStart: $("#backToStart"),
  toast: $("#toast"),
};

// ============ 状态 ============
let currentProtocol = null;
let selectedMood = "stuck";

// ============ 屏幕切换 ============
function showScreen(n) {
  DOM.screen1.classList.toggle("hidden", n !== 1);
  DOM.screen2.classList.toggle("hidden", n !== 2);
  DOM.screen3.classList.toggle("hidden", n !== 3);
  window.scrollTo(0, 0);
}

// ============ 情绪选择 ============
function bindMoodButtons() {
  DOM.moodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      DOM.moodBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMood = btn.dataset.mood;
    });
  });
}

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
    DOM.timerDisplay.textContent = this.format(this.secondsLeft);

    // Update step guide highlight based on remaining time
    const steps = document.querySelectorAll(".step");
    steps.forEach((s) => s.classList.remove("active"));
    let activeStep = 0;
    if (this.secondsLeft <= 60) activeStep = 2;
    else if (this.secondsLeft <= 120) activeStep = 1;
    const activeEl = document.querySelector(`.step[data-step="${activeStep}"]`);
    if (activeEl) activeEl.classList.add("active");
  },

  start() {
    if (this.timerId) return;
    this.timerId = window.setInterval(() => {
      this.secondsLeft = Math.max(0, this.secondsLeft - 1);
      this.update();
      if (this.secondsLeft === 0) {
        this.stop();
        showScreen(3);
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

// ============ 存储 ============
const Storage = {
  KEY: "reset-agent-history",
  MAX: 50,

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

// ============ 协议渲染 ============
function renderProtocol(protocol) {
  DOM.decisionTitle.textContent = protocol.decision;
  DOM.decisionReason.textContent = protocol.reason;
  DOM.handoffPrompt.value = protocol.prompt;

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
  DOM.cardSaved.textContent = `约 ${protocol.savedMinutes} 分钟`;
  DOM.cardNext.textContent = protocol.minimalNext;
  DOM.cardClarity.textContent = "—";

  // 将协议步骤动态注入第二屏倒计时引导
  const stepEls = document.querySelectorAll(".step");
  stepEls.forEach((el, i) => {
    if (protocol.steps[i]) {
      const stepNum = String(i + 1).padStart(2, "0");
      el.innerHTML = `<span>${stepNum}</span> ${protocol.steps[i].title}：${protocol.steps[i].body}`;
    }
  });
}

// ============ 累计统计 ============
function renderStats() {
  const history = Storage.load();
  const todayStr = new Date().toDateString();
  const todaySessions = history.filter((s) => {
    const d = new Date(s.createdAt);
    return d.toDateString() === todayStr;
  });
  const count = todaySessions.length;
  const totalSaved = todaySessions.reduce(
    (sum, s) => sum + (s.savedMinutes || 0),
    0
  );

  const statsBar = document.getElementById("statsBar");
  if (statsBar) {
    statsBar.textContent = `今日已 Reset ${count} 次 · 累计避免硬扛 ${totalSaved} 分钟`;
  }
}

// ============ 清晰度评分 ============
function saveSessionWithScore(afterScore) {
  if (!currentProtocol) return;

  const session = {
    ...currentProtocol,
    afterScore,
    createdAt: new Date().toISOString(),
  };

  Storage.save(session);

  DOM.cardClarity.textContent = `${afterScore}/10`;
  Toast.show("状态已保存");
  renderStats();
}

function bindRatingButtons() {
  const bar = document.getElementById("ratingBar");
  if (!bar) return;
  bar.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const score = Number(btn.dataset.score);
      saveSessionWithScore(score);
      bar.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// ============ 核心：开始 Reset ============
async function handleStartReset() {
  const task = DOM.taskInput.value.trim();
  if (!task) {
    DOM.taskInput.focus();
    Toast.show("先写下当前任务");
    return;
  }

  DOM.startReset.disabled = true;
  DOM.startReset.textContent = "生成中...";

  try {
    currentProtocol = await buildProtocol({
      mood: selectedMood,
      task,
      hardCarryScore: 7,
      clarityScore: 4,
    });

    renderProtocol(currentProtocol);
    renderStats();
    Timer.reset();

    // Reset rating buttons
    const ratingBar = document.getElementById("ratingBar");
    if (ratingBar) {
      ratingBar.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    }

    showScreen(2);
    Timer.start();
  } catch (err) {
    console.error("[App] 生成协议失败:", err);
    Toast.show("生成失败，请重试");
  } finally {
    DOM.startReset.disabled = false;
    DOM.startReset.textContent = "开始 Reset";
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

// ============ 重置 ============
function resetAll() {
  DOM.taskInput.value = "";
  selectedMood = "stuck";
  DOM.moodBtns.forEach((b) => b.classList.remove("active"));
  DOM.moodBtns[0].classList.add("active");
  Timer.reset();

  const ratingBar = document.getElementById("ratingBar");
  if (ratingBar) {
    ratingBar.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  }

  showScreen(1);
}

// ============ 事件绑定 ============
function bindEvents() {
  bindMoodButtons();
  bindRatingButtons();
  DOM.startReset.addEventListener("click", handleStartReset);
  DOM.copyPrompt.addEventListener("click", copyHandoffPrompt);
  DOM.backToStart.addEventListener("click", resetAll);

  DOM.taskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleStartReset();
    }
  });
}

// ============ 初始化 ============
function init() {
  bindEvents();
  Timer.update();
}

init();
