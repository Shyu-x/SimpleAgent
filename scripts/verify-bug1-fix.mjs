// SimpleAgent - BUG-1 修复验证
// 打开 http://localhost:3001，点右上角齿轮按钮，验证桌面端 Settings 模态框能打开
import { chromium } from 'playwright';

const URL = 'http://localhost:3001';
const SHOT = 'docs/online/journeys/mobile-theme/09-bug1-settings-fixed.png';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// 关掉 WelcomeGuide (如果有)
const guide = page.locator('text=欢迎使用').first();
if ((await guide.count()) > 0) {
  // 找 ESC 或关闭按钮
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const skip = page.locator('text=跳过').first();
  if ((await skip.count()) > 0) await skip.click();
  await page.waitForTimeout(500);
}

// 找齿轮按钮
const gear = await page.locator('[title="设置"]').first();
const exists = (await gear.count()) > 0;
console.log(`齿轮按钮: ${exists ? '找到' : '没找到'}`);
if (exists) {
  await gear.click({ force: true });
  await page.waitForTimeout(2000);
}

// 看 Settings 模态框是否打开 (找带"设置"标题的 div)
const settingsVisible = await page
  .locator('text=设置')
  .first()
  .isVisible()
  .catch(() => false);
console.log(`Settings 模态框: ${settingsVisible ? '✓ 打开' : '✗ 仍不可见 (BUG 未修)'}`);

await page.screenshot({ path: SHOT, fullPage: false });
console.log(`截图: ${SHOT}`);

await browser.close();
process.exit(settingsVisible ? 0 : 1);
