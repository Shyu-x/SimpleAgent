// SimpleAgent - MCP 工具市场 UI journey 截图脚本
// 真实场景：ToolMarketplace 组件展示可用 MCP 工具, 用户启用/禁用/配置工具
// 当前完成度 40% (连接有, 工具管理无后端) - 此 journey 验证 UI 渲染 + MCP status
// 真实运行:  node scripts/journey-mcp.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/mcp');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const BACKEND = 'http://localhost:30000';
const VIEWPORT = { width: 1440, height: 900 };
const LIVE = process.argv.includes('--live');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(p) {
  const s = existsSync(p) ? statSync(p).size : 0;
  console.log(`  [${s > 1024 ? 'OK' : 'EMPTY'}] ${p.split('/').pop()} (${(s / 1024).toFixed(1)} KB)`);
}

async function run() {
  if (!LIVE) {
    console.log('[journey-mcp] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) /admin/tools - 工具注册管理界面
    await page.goto(`${FRONTEND}/admin/tools`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    const p1 = join(OUT, '01-tools-page.png');
    await page.screenshot({ path: p1, fullPage: false });
    check(p1);

    // 2) MCP 连接状态可视化 (data: URL)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MCP Status</title>
<style>body{font-family:system-ui;background:linear-gradient(135deg,#1e1b4b,#312e81);color:#e0e7ff;padding:32px;margin:0;min-height:100vh}
h1{color:#a5b4fc;margin:0 0 24px}
.card{background:rgba(255,255,255,0.08);backdrop-filter:blur(10px);border:1px solid rgba(165,180,252,0.3);border-radius:12px;padding:20px;margin:16px 0}
.tool{display:inline-block;background:rgba(34,197,94,0.2);border:1px solid #22c55e;padding:8px 16px;border-radius:6px;margin:4px;font-family:monospace}
.tool.disconnected{background:rgba(239,68,68,0.15);border-color:#ef4444;opacity:0.6}
.status{font-size:48px;font-weight:bold;color:#22c55e}
.status.off{color:#ef4444}
.kv{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1)}
.k{color:#94a3b8}.v{color:#fbbf24;font-weight:bold}</style></head>
<body><h1>MCP 工具市场</h1>
<div id="content">加载中...</div>
<script>
Promise.all([fetch('${BACKEND}/api/minimax/status').then(r=>r.json()),
             fetch('${BACKEND}/api/mcp/status').then(r=>r.json()).catch(()=>({success:false,tools:[]})),
             fetch('${BACKEND}/api/admin/tools/categories/list').then(r=>r.json()).catch(()=>({success:false}))])
.then(([s,m,c])=>{
  const mcp=s.mcp_server||{};
  const registered=s.registered_tools||[];
  const cfg=s.api_config||{};
  const mcpTools=(m.tools||[]);
  const categories=(c.data&&c.data.categories)?c.data.categories.map(x=>x.name):[];
  document.getElementById('content').innerHTML=
    '<div class="card"><div class="status '+(mcp.connected?'':'off')+'">'+(mcp.connected?'已连接':'未连接')+'</div><div style="color:#cbd5e1;margin-top:8px">MCP Server: '+(mcp.server_name||'未配置')+'</div></div>'+
    '<div class="card"><h3 style="margin:0 0 12px">连接详情</h3>'+
    '<div class="kv"><span class="k">MiniMax MCP 连接</span><span class="v">'+(mcp.connected?'OK':'OFF')+'</span></div>'+
    '<div class="kv"><span class="k">MCP 工具总数</span><span class="v">'+(mcpTools.length||0)+'</span></div>'+
    '<div class="kv"><span class="k">Agent 工具分类</span><span class="v">'+categories.length+'</span></div>'+
    '<div class="kv"><span class="k">API Host</span><span class="v">'+cfg.api_host+'</span></div>'+
    '<div class="kv"><span class="k">API Key</span><span class="v">'+(cfg.has_api_key?'已配置':'未配置')+'</span></div>'+(mcp.error?'<div class="kv"><span class="k">错误</span><span class="v">'+mcp.error+'</span></div>':'')+
    '</div>'+
    '<div class="card"><h3 style="margin:0 0 12px">MCP 工具 ('+mcpTools.length+')</h3>'+
    (mcpTools.length?mcpTools.slice(0,8).map(t=>'<span class="tool">'+t.name+'</span>').join('')+(mcpTools.length>8?'<div style="color:#94a3b8;margin-top:8px">... 共 '+mcpTools.length+' 个</div>':''):'<div style="color:#94a3b8">无</div>')+'</div>'+
    '<div class="card"><h3 style="margin:0 0 12px">已注册工具 ('+registered.length+')</h3>'+
    (registered.length?registered.map(t=>'<span class="tool">'+t+'</span>').join(''):'<div style="color:#94a3b8">无</div>')+'</div>';
}).catch(e=>document.getElementById('content').innerHTML='<div class="card">错误: '+e.message+'</div>');
</script></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await sleep(3000);
    const p2 = join(OUT, '02-mcp-status.png');
    await page.screenshot({ path: p2, fullPage: true });
    check(p2);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run().then(() => console.log('ok'));
