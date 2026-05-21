const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:4173');
  await page.waitForTimeout(300);

  // Screen 3: result (full page)
  await page.evaluate(() => {
    document.querySelector('#screen1').classList.add('hidden');
    document.querySelector('#screen3').classList.remove('hidden');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screen3-full.png', fullPage: true });

  await browser.close();
  console.log('Full page screenshot saved: screen3-full.png');
})();
