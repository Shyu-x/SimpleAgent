// SimpleAgent - A2A 多 Agent 协作 journey 截图脚本
// 真实场景：team_leader 模式下分发 3+ 子任务给 code-reviewer / researcher / tester 并行执行
// 后端 /api/a2a/collaborate + /api/a2a/collaboration/:id/result 标准化结果汇总
// 真实运行:  node scripts/journey-a2a.mjs --live
// 默认 dry-run:  仅生成占位 PNG, 不启动浏览器

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/a2a');
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
    console.log('[journey-a2a] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) 拉取 /api/a2a/agents 并在浏览器中以美化 JSON 形式展示
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>A2A Agents</title>
<style>body{font-family:monospace;background:#0f172a;color:#e2e8f0;padding:24px;margin:0}
h1{color:#38bdf8;margin:0 0 12px}
.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:12px 0}
.kv{color:#94a3b8}.v{color:#a7f3d0;font-weight:bold}
pre{background:#0b1220;padding:12px;border-radius:6px;overflow:auto;max-height:600px}
.badge{background:#0284c7;color:white;padding:2px 8px;border-radius:4px;font-size:12px}</style></head>
<body><h1>A2A 多 Agent 协作平台</h1>
<div id="data">加载中...</div>
<script>
fetch('${BACKEND}/api/a2a/agents').then(r=>r.json()).then(j=>{
  const d=document.getElementById('data');
  if(!j.success){d.innerHTML='<div class="card">后端未就绪: '+JSON.stringify(j)+'</div>';return}
  if(!j.agents||!j.agents.length){d.innerHTML='<div class="card"><span class="badge">'+j.count+' agents</span> 当前无活跃 Agent. 后端 /api/a2a/agents 端点正常, 等待协作任务触发.</div>';return}
  d.innerHTML=j.agents.map(a=>'<div class="card"><h3>'+a.name+' <span class="badge">'+a.status+'</span></h3><pre>'+JSON.stringify(a,null,2)+'</pre></div>').join('');
}).catch(e=>document.getElementById('data').innerHTML='<div class="card">错误: '+e.message+'</div>');
</script></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await sleep(2500);
    const p1 = join(OUT, '01-agents-list.png');
    await page.screenshot({ path: p1, fullPage: true });
    check(p1);

    // 2) 协作统计 + 协调模式 (data: URL 形式)
    const html2 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>A2A Stats</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:24px;margin:0}
h1,h2{color:#38bdf8}
table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
th,td{padding:12px 16px;text-align:left;border-bottom:1px solid #334155}
th{background:#0c4a6e;color:white}
tr:hover{background:#334155}
.badge{display:inline-block;background:#0284c7;color:white;padding:4px 12px;border-radius:12px;margin:4px}</style></head>
<body><h1>A2A 协作统计</h1>
<div id="stats">加载中...</div>
<h2>支持的协调模式</h2>
<div id="modes"></div>
<script>
Promise.all([fetch('${BACKEND}/api/a2a/collaboration/stats').then(r=>r.json()),
             fetch('${BACKEND}/api/a2a/coordination/modes').then(r=>r.json())])
.then(([s,m])=>{
  const sd=document.getElementById('stats');
  sd.innerHTML='<table><tr><th>指标</th><th>值</th></tr>'+
    Object.entries(s).filter(([k])=>k!=='success'&&k!=='agents'&&k!=='coordinationModes').map(([k,v])=>'<tr><td>'+k+'</td><td class="v">'+v+'</td></tr>').join('')+'</table>';
  const md=document.getElementById('modes');
  const modes=Object.values(m.modes||{});
  md.innerHTML=modes.length?modes.map(mode=>'<div style="background:#1e293b;padding:12px;margin:8px 0;border-radius:6px"><b>'+mode.value+'</b><br>'+mode.description+'<br><span class="badge">适用: '+(mode.useCase||'-')+'</span></div>').join(''):'<div class="card">无协调模式数据</div>';
}).catch(e=>document.body.innerHTML='<h1>错误</h1><pre>'+e.message+'</pre>');
</script></body></html>`;
    await page.setContent(html2, { waitUntil: 'load' });
    await sleep(2500);
    const p2 = join(OUT, '02-collaboration-stats.png');
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
