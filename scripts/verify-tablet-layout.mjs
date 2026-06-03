// B6 LAYOUT-1: 验证 iPad 视口 (768x1024) 走 TabletLayout
import { chromium } from 'playwright';
import { join } from 'path';

const SHOT = '/home/xu/Develop/longTermProject/SimpleAgent/docs/online/journeys/mobile-theme/11-ipad-tablet-layout.png';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
const page = await ctx.newPage();

await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

// 关 welcome
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const skip = page.locator('button:has-text("跳过")');
  if ((await skip.count()) > 0) {
    try { await skip.click({ timeout: 1500 }); } catch {}
  }
  await page.waitForTimeout(300);
}

await page.screenshot({ path: SHOT, fullPage: false });
console.log(`截图: ${SHOT}`);

await browser.close();
