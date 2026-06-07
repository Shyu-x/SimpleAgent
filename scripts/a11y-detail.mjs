import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE = resolve('/home/xu/Develop/longTermProject/SimpleAgent/frontend/node_modules/axe-core/axe.min.js');

const TARGETS = [
  { name: '主聊天', url: 'http://localhost:3001/' },
  { name: '工具管理', url: 'http://localhost:3001/admin/tools' },
];

const browser = await chromium.launch();
for (const t of TARGETS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(t.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addScriptTag({ path: AXE });
  const results = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations;
  });
  for (const v of results) {
    if (!['aria-prohibited-attr', 'heading-order'].includes(v.id)) continue;
    console.log(`\n=== ${t.name} / ${v.id} ===`);
    for (const node of v.nodes) {
      console.log(`HTML: ${node.html.slice(0, 250)}`);
      console.log(`TARGET: ${node.target.join(' ')}`);
      console.log(`FAIL: ${(node.failureSummary || '').slice(0, 400)}`);
      console.log('---');
    }
  }
  await ctx.close();
}
await browser.close();
