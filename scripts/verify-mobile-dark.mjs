// B7 THEME-4: 验证移动深色模式子组件适配
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHOT = join(ROOT, 'docs/online/journeys/mobile-theme/12-mobile-dark.png');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 667 },
  colorScheme: 'dark',
});
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
