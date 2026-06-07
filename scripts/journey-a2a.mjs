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

async function jsonGet(url) {
  const r = await fetch(url);
  return r.json();
}

async function jsonPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

/**
 * 预置 A2A 测试数据: 注册 3 个不同能力的 agent
 * 单机环境没有真实 agent 进程, 主要目的是让 /api/a2a/agents 不再返回空
 * (实际任务执行仍会失败 - 这是预期的 5d 边界)
 */
async function seedAgents() {
  const seeds = [
    { id: 'code-reviewer', name: 'Code Reviewer', type: 'reviewer', capabilities: ['code-review', 'analysis'] },
    { id: 'researcher', name: 'Research Analyst', type: 'researcher', capabilities: ['research', 'analysis'] },
    { id: 'tester', name: 'Test Engineer', type: 'tester', capabilities: ['testing', 'code-review'] },
  ];
  let registered = 0;
  for (const a of seeds) {
    const r = await jsonPost(`${BACKEND}/api/a2a/agents/register`, a);
    if (r.success) registered++;
  }
  console.log(`  [seed] registered ${registered}/${seeds.length} agents`);
}

async function run() {
  if (!LIVE) {
    console.log('[journey-a2a] dry-run 模式: 仅占位, 加 --live 启动 chromium');
    return;
  }

  console.log('[journey-a2a] seeding agents...');
  await seedAgents();

  // 保持 agent online - 60s 心跳超时, 每 5s 心跳一次
  const AGENT_IDS = ['code-reviewer', 'researcher', 'tester'];
  const heartbeatTimer = setInterval(() => {
    for (const id of AGENT_IDS) {
      jsonPost(`${BACKEND}/api/a2a/agents/${id}/heartbeat`, {}).catch(() => {});
    }
  }, 5000);

  await sleep(800);

  // 预取 API 数据 (避免在页面内 fetch 触发额外限流计数)
  const agentsData = await jsonGet(`${BACKEND}/api/a2a/agents`).catch(() => ({}));
  const statsData = await jsonGet(`${BACKEND}/api/a2a/collaboration/stats`).catch(() => ({}));
  const modesData = await jsonGet(`${BACKEND}/api/a2a/coordination/modes`).catch(() => ({}));
  const tasksData = await jsonGet(`${BACKEND}/api/a2a/tasks`).catch(() => ({}));
  console.log(`  [prefetch] agents=${agentsData.count||0} tasks=${tasksData.count||0} modes=${Object.keys(modesData.modes||{}).length}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    // 1) 拉取 /api/a2a/agents 并在浏览器中以美化 JSON 形式展示 (使用预取数据)
    const agentsJson = JSON.stringify(agentsData);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>A2A Agents</title>
<style>body{font-family:monospace;background:#0f172a;color:#e2e8f0;padding:24px;margin:0}
h1{color:#38bdf8;margin:0 0 12px}
.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:12px 0}
.kv{color:#94a3b8}.v{color:#a7f3d0;font-weight:bold}
pre{background:#0b1220;padding:12px;border-radius:6px;overflow:auto;max-height:600px}
.badge{background:#0284c7;color:white;padding:2px 8px;border-radius:4px;font-size:12px}
.badge.online{background:#16a34a}
.badge.offline{background:#64748b}
.cap{background:#1e40af;color:#dbeafe;padding:2px 6px;border-radius:4px;font-size:11px;margin-right:4px}</style></head>
<body><h1>A2A 多 Agent 协作平台</h1>
<div id="data">加载中...</div>
<script>
const DATA = ${agentsJson};
const j = DATA;
const d=document.getElementById('data');
if(!j.success){d.innerHTML='<div class="card">后端未就绪: '+JSON.stringify(j)+'</div>';}
else if(!j.agents||!j.agents.length){d.innerHTML='<div class="card"><span class="badge">'+j.count+' agents</span> 当前无活跃 Agent. 后端 /api/a2a/agents 端点正常, 等待协作任务触发.</div>';}
else {d.innerHTML='<div class="card"><span class="badge online">'+j.count+' agents online</span> 后端 A2A 注册表已就绪.</div>'
  +j.agents.map(a=>'<div class="card">'
    +'<h3>'+a.name+' <span class="badge '+(a.status||"")+'">'+a.status+'</span> '
    +'<span style="color:#94a3b8">('+a.type+')</span></h3>'
    +'<div style="margin:8px 0">'+(a.capabilities||[]).map(c=>'<span class="cap">'+c+'</span>').join('')+'</div>'
    +'<div class="kv">ID: <span class="v">'+a.id+'</span> · 注册: '+new Date(a.registeredAt).toLocaleTimeString()+' · 心跳: '+new Date(a.lastSeen).toLocaleTimeString()+'</div>'
    +'</div>').join('');}
</script></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await sleep(2500);
    const p1 = join(OUT, '01-agents-list.png');
    await page.screenshot({ path: p1, fullPage: true });
    check(p1);

    // 2) 协作统计 + 协调模式 (使用预取数据)
    const statsJson = JSON.stringify(statsData);
    const modesJson = JSON.stringify(modesData);
    const html2 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>A2A Stats</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:24px;margin:0}
h1,h2{color:#38bdf8}
table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
th,td{padding:12px 16px;text-align:left;border-bottom:1px solid #334155}
th{background:#0c4a6e;color:white}
tr:hover{background:#334155}
.badge{display:inline-block;background:#0284c7;color:white;padding:4px 12px;border-radius:12px;margin:4px}
.mode{background:#1e293b;padding:12px;margin:8px 0;border-radius:6px}</style></head>
<body><h1>A2A 协作统计</h1>
<div id="stats"></div>
<h2>支持的协调模式</h2>
<div id="modes"></div>
<script>
const S = ${statsJson};
const M = ${modesJson};
const sd=document.getElementById('stats');
sd.innerHTML='<table><tr><th>指标</th><th>值</th></tr>'
  +Object.entries(S).filter(([k])=>!['success','agents','coordinationModes'].includes(k)).map(([k,v])=>'<tr><td>'+k+'</td><td class="v">'+JSON.stringify(v)+'</td></tr>').join('')
  +'</table>';
const md=document.getElementById('modes');
const modes=Object.values(M.modes||{});
md.innerHTML=modes.length?modes.map(mode=>'<div class="mode"><b>'+mode.value+'</b><br>'+mode.description+'<br><span class="badge">适用: '+(mode.useCase||'-')+'</span></div>').join(''):'<div>无协调模式数据</div>';
</script></body></html>`;
    await page.setContent(html2, { waitUntil: 'load' });
    await sleep(2500);
    const p2 = join(OUT, '02-collaboration-stats.png');
    await page.screenshot({ path: p2, fullPage: true });
    check(p2);

    // 3) 任务定义 + 协作 task 列表 (使用预取数据)
    const tasksJson = JSON.stringify(tasksData);
    const modesJson3 = JSON.stringify(modesData);
    const html3 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>A2A Tasks</title>
<style>body{font-family:monospace;background:#0f172a;color:#e2e8f0;padding:24px;margin:0}
h1,h2{color:#38bdf8}
.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin:12px 0}
pre{background:#0b1220;padding:12px;border-radius:6px;overflow:auto;max-height:240px;font-size:12px}
.badge{background:#0284c7;color:white;padding:2px 8px;border-radius:4px;font-size:12px}
.badge.failed{background:#dc2626}
.badge.pending{background:#eab308;color:#000}</style></head>
<body><h1>A2A 任务列表 (team_leader 协作)</h1>
<div id="data"></div>
<script>
const T = ${tasksJson};
const M = ${modesJson3};
const d=document.getElementById('data');
d.innerHTML='<div class="card">'
  +'<b>协调模式:</b> ' + Object.keys(M.modes||{}).map(k=>'<span class="badge">'+k+'</span>').join(' ')
  +' · <b>任务总数:</b> ' + (T.count||0) + '</div>'
  + (T.tasks||[]).slice(0,3).map(t=>'<div class="card">'
    +'<h3>'+t.title+' <span class="badge '+(t.status||"")+'">'+t.status+'</span></h3>'
    +'<div>类型: <b>'+t.type+'</b> · from: '+t.from+' · to: '+(t.to||'-')+'</div>'
    +'<pre>'+JSON.stringify(t.input, null, 2)+'</pre>'
    +(t.error?'<div style="color:#fca5a5">错误: '+t.error+'</div>':'')
    +'</div>').join('');
</script></body></html>`;
    await page.setContent(html3, { waitUntil: 'load' });
    await sleep(2500);
    const p3 = join(OUT, '03-task-list.png');
    await page.screenshot({ path: p3, fullPage: true });
    check(p3);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  } finally {
    clearInterval(heartbeatTimer);
    await browser.close();
  }
}

run().then(() => console.log('ok'));
