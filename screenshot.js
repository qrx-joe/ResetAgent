const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:4173');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screen1.png' });

  // Screen 2: countdown
  await page.evaluate(() => {
    document.querySelector('#screen1').classList.add('hidden');
    document.querySelector('#screen2').classList.remove('hidden');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screen2.png' });

  // Screen 3: result
  await page.evaluate(() => {
    document.querySelector('#screen2').classList.add('hidden');
    document.querySelector('#screen3').classList.remove('hidden');
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'screen3.png' });

  await browser.close();
  console.log('Screenshots saved: screen1.png, screen2.png, screen3.png');
})();
