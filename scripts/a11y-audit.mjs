#!/usr/bin/env node
/**
 * a11y 审计 - 使用 axe-core 检测 WCAG 2.2 AA
 * 跑 5 个核心页面, 输出违规统计
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE_PATH = resolve(__dirname, '../frontend/node_modules/axe-core/axe.min.js');

const PAGES = [
  { name: '主聊天', url: 'http://localhost:3001/' },
  { name: '管理后台', url: 'http://localhost:3001/admin' },
  { name: '工具管理', url: 'http://localhost:3001/admin/tools' },
  { name: '知识库', url: 'http://localhost:3001/admin/kb' },
  { name: 'Agent 模式', url: 'http://localhost:3001/agent' },
];

const SEVERITY_ORDER = ['critical', 'serious', 'moderate', 'minor'];

async function auditPage(browser, pageInfo) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const violations = [];
  let loadError = null;

  try {
    const response = await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response ? response.status() : 0;
    if (status >= 400) loadError = `HTTP ${status}`;

    // 等 Next.js 客户端 hydration + 初始渲染完成
    // 禁用 SSE / fetch 干扰, 用 dom-based 等待
    try {
      await page.waitForLoadState('load', { timeout: 8000 });
    } catch {
      // 忽略: dev server 持续 SSE, 'load' 可能等不到
    }
    await page.waitForTimeout(3000);

    // 注入 axe-core
    const axeSource = await readFile(AXE_PATH, 'utf-8');
    await page.addScriptTag({ content: axeSource });

    // 运行 axe
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
        resultTypes: ['violations'],
      });
    });

    for (const v of results.violations) {
      violations.push({
        id: v.id,
        impact: v.impact || 'minor',
        help: v.help,
        helpUrl: v.helpUrl,
        description: v.description,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
        failureSummary: v.nodes[0]?.failureSummary?.split('\n')[0] || '',
      });
    }
  } catch (err) {
    loadError = err.message;
  } finally {
    await context.close();
  }

  return { ...pageInfo, violations, loadError };
}

function aggregateStats(allResults) {
  const stats = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
  const byId = new Map();

  for (const r of allResults) {
    for (const v of r.violations) {
      stats[v.impact] = (stats[v.impact] || 0) + v.nodes;
      stats.total += v.nodes;
      if (!byId.has(v.id)) {
        byId.set(v.id, { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, totalNodes: 0, pages: [] });
      }
      const entry = byId.get(v.id);
      entry.totalNodes += v.nodes;
      if (!entry.pages.includes(r.name)) entry.pages.push(r.name);
    }
  }
  return { stats, byId };
}

async function main() {
  console.log('=== A11y 审计启动 ===');
  console.log(`axe-core 路径: ${AXE_PATH}`);
  console.log(`目标页面: ${PAGES.length}\n`);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  const results = [];
  for (const p of PAGES) {
    process.stdout.write(`  [扫描] ${p.name.padEnd(10)} ${p.url} ... `);
    const r = await auditPage(browser, p);
    const err = r.loadError ? ` (${r.loadError})` : '';
    console.log(`${r.violations.length} 规则违规${err}`);
    results.push(r);
  }

  await browser.close();

  const { stats, byId } = aggregateStats(results);

  console.log('\n=== 统计 ===');
  console.log(`总违规节点: ${stats.total}`);
  for (const s of SEVERITY_ORDER) {
    console.log(`  ${s.padEnd(10)}: ${stats[s]}`);
  }

  // 排序: impact 严重度 + 总节点数
  const impactWeight = { critical: 4, serious: 3, moderate: 2, minor: 1 };
  const top = [...byId.values()].sort((a, b) => {
    const w = impactWeight[b.impact] - impactWeight[a.impact];
    return w !== 0 ? w : b.totalNodes - a.totalNodes;
  });

  console.log('\n=== Top 违规 (按严重度+节点数) ===');
  top.slice(0, 10).forEach((v, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${v.impact.toUpperCase()}] ${v.id} (${v.totalNodes} 节点)`);
    console.log(`     ${v.help}`);
    console.log(`     涉及: ${v.pages.join(', ')}`);
  });

  // 输出原始 JSON 供报告使用
  const report = {
    timestamp: new Date().toISOString(),
    pages: results.map(r => ({
      name: r.name,
      url: r.url,
      loadError: r.loadError,
      violationRules: r.violations.length,
      violationNodes: r.violations.reduce((s, v) => s + v.nodes, 0),
      violations: r.violations,
    })),
    stats,
    top: top.slice(0, 20).map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      totalNodes: v.totalNodes,
      pages: v.pages,
    })),
  };

  console.log('\n=== JSON 输出 ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
