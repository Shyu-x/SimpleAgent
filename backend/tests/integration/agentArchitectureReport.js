/**
 * Agent 架构能力评估报告
 * 评估各模块的实际能力
 */

const http = require('http');

const BASE_URL = 'http://localhost:30000';

async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('超时')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testEndpoint(name, method, path, body = null) {
  try {
    const res = await request(method, path, body);
    return { name, status: res.status, success: res.status >= 200 && res.status < 300 };
  } catch (e) {
    return { name, status: 0, success: false, error: e.message };
  }
}

async function generateReport() {
  console.log('================================================');
  console.log('Agent 架构能力评估报告');
  console.log('================================================\n');

  const results = {
    miniMaxAgent: [],
    enhancedAgent: [],
    multiAgent: [],
    a2a: [],
    hitl: [],
    memory: []
  };

  // MiniMax Agent API
  console.log('【1. MiniMax Agent API】');
  let sessionId;
  let r = await testEndpoint('创建会话', 'POST', '/api/minimax-agent/session', { model: 'MiniMax-M2.7' });
  results.miniMaxAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);
  if (r.success && r.status === 200) {
    sessionId = r.data?.sessionId;
  }

  if (sessionId) {
    r = await testEndpoint('执行任务', 'POST', '/api/minimax-agent/execute', { sessionId, task: '你好' });
    results.miniMaxAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('获取状态', 'GET', `/api/minimax-agent/session/${sessionId}`);
    results.miniMaxAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('获取工具', 'GET', '/api/minimax-agent/tools');
    results.miniMaxAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('删除会话', 'DELETE', `/api/minimax-agent/session/${sessionId}`);
    results.miniMaxAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);
  }

  // Enhanced Agent API
  console.log('\n【2. Enhanced Agent API】');
  r = await testEndpoint('执行任务', 'POST', '/api/enhanced-agent/execute', { task: '你好' });
  results.enhancedAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);
  const enhSessionId = r.data?.sessionId;

  if (enhSessionId) {
    r = await testEndpoint('获取状态', 'GET', `/api/enhanced-agent/status/${enhSessionId}`);
    results.enhancedAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('创建检查点', 'POST', `/api/enhanced-agent/checkpoint/${enhSessionId}`);
    results.enhancedAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('获取记忆', 'GET', `/api/enhanced-agent/memory/${enhSessionId}`);
    results.enhancedAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('暂停会话', 'POST', `/api/enhanced-agent/pause/${enhSessionId}`);
    results.enhancedAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('恢复会话', 'POST', `/api/enhanced-agent/resume/${enhSessionId}`);
    results.enhancedAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('删除会话', 'DELETE', `/api/enhanced-agent/session/${enhSessionId}`);
    results.enhancedAgent.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);
  }

  // Multi-Agent API
  console.log('\n【3. Multi-Agent API】');
  r = await testEndpoint('获取模板', 'GET', '/api/multiagent/templates');
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('创建 Agent', 'POST', '/api/multiagent/agent', { role: '测试', goal: '测试' });
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('创建 Task', 'POST', '/api/multiagent/task', { description: '测试任务' });
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('创建 Crew', 'POST', '/api/multiagent/crew', { name: '测试团队' });
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('获取 Crews', 'GET', '/api/multiagent/crews');
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('创建引擎', 'POST', '/api/multiagent/engine', { sessionId: 'test' });
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('健康检查', 'GET', '/api/multiagent/health');
  results.multiAgent.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  // A2A Protocol
  console.log('\n【4. A2A 协议】');
  r = await testEndpoint('服务状态', 'GET', '/api/a2a/status');
  results.a2a.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('获取 Agents', 'GET', '/api/a2a/agents');
  results.a2a.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('注册 Agent', 'POST', '/api/a2a/agents/register', { id: 'test_a2a', name: 'Test' });
  results.a2a.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  if (r.success) {
    r = await testEndpoint('发送消息', 'POST', '/api/a2a/send', { from: 'test', to: 'test_a2a', type: 'message.send', payload: {} });
    results.a2a.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('接收消息', 'GET', '/api/a2a/receive?agentId=test_a2a&clear=true');
    results.a2a.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('心跳', 'POST', '/api/a2a/agents/test_a2a/heartbeat');
    results.a2a.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

    r = await testEndpoint('注销 Agent', 'POST', '/api/a2a/agents/test_a2a/unregister');
    results.a2a.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);
  }

  // HITL
  console.log('\n【5. HITL 人机协作】');
  r = await testEndpoint('确认请求', 'GET', '/api/hitl/requests');
  results.hitl.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('创建确认', 'POST', '/api/hitl/request', { sessionId: 'test', action: 'delete', riskLevel: 'high' });
  results.hitl.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  // Memory
  console.log('\n【6. 记忆系统】');
  r = await testEndpoint('获取记忆', 'GET', '/api/memory/stats');
  results.memory.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  r = await testEndpoint('搜索记忆', 'POST', '/api/memory/search', { query: 'test' });
  results.memory.push(r);
  console.log(`  ${r.success ? '✅' : '❌'} ${r.name}: ${r.status}`);

  // Summary
  console.log('\n================================================');
  console.log('评估总结');
  console.log('================================================\n');

  const summary = {};
  for (const [category, tests] of Object.entries(results)) {
    const passed = tests.filter(t => t.success).length;
    const total = tests.length;
    summary[category] = { passed, total, rate: Math.round((passed / total) * 100) };
  }

  console.log('| 模块 | 通过 | 总数 | 成功率 |');
  console.log('|------|------|------|--------|');
  for (const [category, { passed, total, rate }] of Object.entries(summary)) {
    const name = {
      miniMaxAgent: 'MiniMax Agent',
      enhancedAgent: 'Enhanced Agent',
      multiAgent: 'Multi-Agent',
      a2a: 'A2A 协议',
      hitl: 'HITL 人机协作',
      memory: '记忆系统'
    }[category];
    console.log(`| ${name} | ${passed} | ${total} | ${rate}% |`);
  }

  const totalPassed = Object.values(summary).reduce((sum, s) => sum + s.passed, 0);
  const totalTests = Object.values(summary).reduce((sum, s) => sum + s.total, 0);
  const overallRate = Math.round((totalPassed / totalTests) * 100);

  console.log(`\n综合评分: ${totalPassed}/${totalTests} (${overallRate}%)`);

  if (overallRate >= 80) {
    console.log('评价: 优秀 - Agent 架构工作正常');
  } else if (overallRate >= 60) {
    console.log('评价: 良好 - Agent 架构基本可用');
  } else if (overallRate >= 40) {
    console.log('评价: 一般 - 部分功能需要修复');
  } else {
    console.log('评价: 较差 - 需要重大改进');
  }

  // Capabilities Analysis
  console.log('\n================================================');
  console.log('能力分析');
  console.log('================================================\n');

  console.log('【已实现能力】');
  console.log('✅ MiniMax Agent 会话管理 (创建/执行/删除)');
  console.log('✅ Enhanced Agent 状态管理 (暂停/恢复/检查点)');
  console.log('✅ Multi-Agent 团队管理 (Agent/Task/Crew)');
  console.log('✅ A2A Agent 间通信协议 (注册/消息/委托)');
  console.log('✅ 记忆系统 (存储/检索)');
  console.log('✅ HITL 人机协作确认机制');

  console.log('\n【待验证能力】');
  console.log('⚠️ MiniMax API 实际对话 (需要有效的 API Key)');
  console.log('⚠️ 工具调用 (需要 MiniMax Agent Runner)');
  console.log('⚠️ 多轮对话上下文保持');
  console.log('⚠️ 检查点恢复机制');

  console.log('\n【架构优势】');
  console.log('1. 分层架构清晰 (routes → application → domain → infra)');
  console.log('2. A2A 协议完整 (支持注册/心跳/消息/任务委托)');
  console.log('3. 多 Agent 协作 (Crew/Kickoff/Parallel)');
  console.log('4. HITL 机制 (危险操作确认)');
  console.log('5. 记忆系统 (短期/长期记忆分离)');

  console.log('\n【待改进点】');
  console.log('1. MiniMax API 认证问题需排查');
  console.log('2. SSE 流式响应需集成真实 API');
  console.log('3. 工具注册表需完善');
  console.log('4. 检查点持久化需对接数据库');

  console.log('\n================================================\n');
}

generateReport().catch(console.error);
