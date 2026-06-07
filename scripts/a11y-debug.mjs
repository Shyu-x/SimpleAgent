import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE_PATH = '/home/xu/Develop/longTermProject/SimpleAgent/frontend/node_modules/axe-core/axe.min.js';

const PAGES = [
  { name: '主聊天', url: 'http://localhost:3001/' },
  { name: '管理后台', url: 'http://localhost:3001/admin' },
  { name: '工具管理', url: 'http://localhost:3001/admin/tools' },
  { name: '知识库', url: 'http://localhost:3001/admin/kb' },
  { name: 'Agent 模式', url: 'http://localhost:3001/agent' },
];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const axeSource = await readFile(AXE_PATH, 'utf-8');
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    return await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
  });
  console.log(`\n=== ${p.name} ===`);
  for (const v of results.violations) {
    console.log(`\n## ${v.id} (${v.nodes.length} nodes)`);
    for (const n of v.nodes) {
      console.log(`  target: ${n.target.join(' ')}`);
      const failureMsg = n.failureSummary?.split('\n').filter(l => l.trim()).join(' | ');
      if (failureMsg) console.log(`  fix: ${failureMsg}`);
    }
  }
  await ctx.close();
}

await browser.close();
