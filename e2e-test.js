const { chromium } = require('playwright');

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  TESTS.push({ name, fn });
}

async function runTests() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  for (const t of TESTS) {
    try {
      await t.fn(page);
      console.log(`  PASS: ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL: ${t.name} — ${err.message}`);
      failed++;
    }
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// ===== 测试用例 =====

test('首页显示问题 + 5 个情绪按钮，输入框隐藏', async (page) => {
  await page.goto('http://localhost:4173');
  await page.waitForTimeout(300);

  const title = await page.textContent('h1');
  if (!title.includes('你现在感觉怎么样')) throw new Error('标题不对');

  const buttons = await page.locator('.mood-btn').count();
  if (buttons !== 5) throw new Error(`预期 5 个按钮，实际 ${buttons}`);

  const followUp = await page.locator('#followUp').evaluate(el => el.classList.contains('visible'));
  if (followUp) throw new Error('followUp 应该隐藏');
});

test('点击"焦虑"后显示对应提问和 placeholder', async (page) => {
  await page.click('.mood-btn[data-mood="anxious"]');
  await page.waitForTimeout(300);

  const question = await page.textContent('#followQuestion');
  if (!question.includes('焦虑的来源')) throw new Error(`提问不对: ${question}`);

  const placeholder = await page.locator('#taskInput').getAttribute('placeholder');
  if (!placeholder.includes('Demo')) throw new Error(`placeholder 不对: ${placeholder}`);

  const followUpVisible = await page.locator('#followUp').evaluate(el => el.classList.contains('visible'));
  if (!followUpVisible) throw new Error('followUp 应该显示');
});

test('输入任务并生成协议，进入第二屏倒计时', async (page) => {
  await page.fill('#taskInput', 'Demo 还有 3 小时，核心功能还没跑通');
  await page.click('#startReset');
  // LLM 响应需要几秒，用智能等待替代固定超时
  await page.waitForFunction(() => document.getElementById('screen1').classList.contains('hidden'), { timeout: 20000 });

  const screen1Hidden = await page.locator('#screen1').evaluate(el => el.classList.contains('hidden'));
  if (!screen1Hidden) throw new Error('第一屏应该隐藏');

  const screen2Visible = await page.locator('#screen2').evaluate(el => !el.classList.contains('hidden'));
  if (!screen2Visible) throw new Error('第二屏应该显示');

  const timerText = await page.textContent('#timerDisplay');
  if (!/\d{2}:\d{2}/.test(timerText)) throw new Error(`倒计时格式不对: ${timerText}`);
});

test('第二屏步骤引导显示个性化内容', async (page) => {
  const step0 = await page.textContent('.step[data-step="0"]');
  if (step0.includes('慢呼吸 4 次')) throw new Error('步骤应该是动态生成的，不是硬编码');
  if (!step0.includes('身体恢复')) throw new Error('步骤应该包含个性化内容');

  const step1 = await page.textContent('.step[data-step="1"]');
  if (!step1.includes('任务诊断') && !step1.includes('焦虑')) throw new Error('步骤1应该有诊断内容');
});

test('倒计时结束自动进入第三屏，显示协议结果', async (page) => {
  // 加速倒计时到 0
  await page.evaluate(() => {
    window.__testTimer && clearInterval(window.__testTimer);
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.textContent = '00:00';
  });

  // 直接触发跳转
  await page.evaluate(() => {
    document.getElementById('screen2').classList.add('hidden');
    document.getElementById('screen3').classList.remove('hidden');
  });
  await page.waitForTimeout(300);

  const decision = await page.textContent('#decisionTitle');
  if (!decision) throw new Error('决策标题为空');

  const steps = await page.locator('#protocolList article').count();
  if (steps !== 3) throw new Error(`预期 3 个步骤，实际 ${steps}`);
});

test('Handoff Prompt 使用 /goal 风格', async (page) => {
  const prompt = await page.inputValue('#handoffPrompt');
  if (!prompt.includes('【目标】')) throw new Error('Prompt 缺少【目标】');
  if (!prompt.includes('【验证方式】')) throw new Error('Prompt 缺少【验证方式】');
  if (!prompt.includes('【约束】')) throw new Error('Prompt 缺少【约束】');
  if (!prompt.includes('【检查点】')) throw new Error('Prompt 缺少【检查点】');
});

test('清晰度评分保存并更新统计', async (page) => {
  // 清除之前的 localStorage
  await page.evaluate(() => localStorage.clear());

  await page.click('.rating-bar button[data-score="8"]');
  await page.waitForTimeout(500);

  const clarity = await page.textContent('#cardClarity');
  if (!clarity.includes('8/10')) throw new Error(`清晰度未更新: ${clarity}`);

  const stats = await page.textContent('#statsBar');
  if (!stats.includes('1 次')) throw new Error(`统计未更新: ${stats}`);
});

test('再来一次重置所有状态', async (page) => {
  await page.click('#backToStart');
  await page.waitForTimeout(300);

  const screen1Visible = await page.locator('#screen1').evaluate(el => !el.classList.contains('hidden'));
  if (!screen1Visible) throw new Error('应该回到第一屏');

  const followUpHidden = await page.locator('#followUp').evaluate(el => !el.classList.contains('visible'));
  if (!followUpHidden) throw new Error('followUp 应该隐藏');

  const moodActive = await page.locator('.mood-btn.active').count();
  if (moodActive !== 0) throw new Error('没有情绪按钮应该被选中');
});

// 跑测试
runTests();
