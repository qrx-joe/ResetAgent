const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:4173');
  await page.waitForTimeout(500);

  // Screenshot 1: initial state (no mood selected, follow-up hidden)
  await page.screenshot({ path: 'home-initial.png' });

  // Click "疲劳"
  await page.click('.mood-btn[data-mood="tired"]');
  await page.waitForTimeout(400);

  // Screenshot 2: after clicking tired (follow-up visible with custom question)
  await page.screenshot({ path: 'home-tired.png' });

  await browser.close();
  console.log('Saved: home-initial.png, home-tired.png');
})();
