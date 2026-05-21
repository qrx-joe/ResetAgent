const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:4173');
  await page.waitForTimeout(300);

  // Enter task and start reset
  await page.fill('#taskInput', '登录页提交后没有跳转，我已经改了 2 小时，越改越乱');
  await page.click('#startReset');
  await page.waitForTimeout(800);

  // Screenshot screen 2 (countdown with personalized steps)
  await page.screenshot({ path: 'verify-screen2.png' });

  await browser.close();
  console.log('Saved verify-screen2.png');
})();
