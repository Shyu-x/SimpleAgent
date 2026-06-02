// Playwright 截图脚本 - G2 console 清理验证
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCREENSHOTS_DIR = join(__dirname, '..', 'docs', 'online', 'screenshots');
const BASE_URL = 'http://localhost:3001';

async function shoot(page, url, file) {
  console.log(`📸 ${url} → ${file}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SCREENSHOTS_DIR, file), fullPage: false });
  console.log(`  ✓ saved`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. 主对话页
    await shoot(page, BASE_URL, 'main.png');

    // 2. 管理后台 - tools 页
    await shoot(page, `${BASE_URL}/admin/tools`, 'admin-tools.png');

    // 3. 管理后台 - 总览
    await shoot(page, `${BASE_URL}/admin`, 'admin-dashboard.png');

    // 4. 管理后台 - 知识库
    await shoot(page, `${BASE_URL}/admin/kb`, 'admin-kb.png');
  } catch (e) {
    console.error('Screenshot failed:', e.message);
  } finally {
    await browser.close();
  }
})();
