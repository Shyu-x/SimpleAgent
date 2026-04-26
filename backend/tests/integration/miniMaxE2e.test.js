/**
 * MiniMax API 端到端对话测试
 * 实际调用 MiniMax API 测试对话和任务执行能力
 */

const http = require('http');
const { URL } = require('url');

// 测试配置
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 60000;

// 统计
let passed = 0;
let failed = 0;
const results = [];

// ========== 辅助函数 ==========

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(obj, key, message) {
  if (!obj[key] && obj[key] !== 0) throw new Error(`${message}: 对象不包含 ${key}`);
}

// HTTP 请求封装
function request(method, path, body = null) {
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
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('请求超时')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// SSE 请求 - 收集所有 chunk (支持 OpenAI 和 MiniMax 格式)
function collectSSE(method, path, body = null) {
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
      let buffer = '';

      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]' || jsonStr === '') continue;
            try {
              const event = JSON.parse(jsonStr);

              // OpenAI 格式: choices[0].delta.content
              if (event.choices && event.choices[0]?.delta?.content) {
                data += event.choices[0].delta.content;
              }
              // MiniMax 格式: type === 'chunk' with content
              else if (event.type === 'chunk' && event.content) {
                data += event.content;
              }
              // MiniMax thinking: 提取 <THINK>...</THINK> 之间的内容
              else if (event.choices && event.choices[0]?.delta?.content?.includes('[THINK]')) {
                const match = event.choices[0].delta.content.match(/\[THINK\](.*?)\[\/THINK\]/);
                if (match) {
                  data += match[1];
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });

      res.on('end', () => {
        resolve({ status: res.statusCode, content: data });
      });
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('SSE 超时')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTest(name, fn) {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    console.log(`  ✅ ${name} (${duration}ms)`);
    passed++;
    results.push({ name, status: 'pass', duration, result });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`  ❌ ${name}: ${error.message} (${duration}ms)`);
    failed++;
    results.push({ name, status: 'fail', duration, error: error.message });
  }
}

// ========== 1. 日常对话测试 ==========

async function testDailyConversation() {
  console.log('\n========================================');
  console.log('1. 日常对话测试');
  console.log('========================================\n');

  await runTest('简单问候', async () => {
    const res = await collectSSE('POST', '/api/v1/chat/completions', {
      messages: [{ role: 'user', content: '你好' }],
      model: 'MiniMax-M2.7'
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(res.content.length > 0, '应返回内容');
    console.log(`    回复: ${res.content.substring(0, 80)}...`);
  });

  await runTest('知识问答', async () => {
    const res = await collectSSE('POST', '/api/v1/chat/completions', {
      messages: [{ role: 'user', content: '什么是人工智能？' }],
      model: 'MiniMax-M2.7'
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(res.content.length > 20, '回复内容应足够长');
    console.log(`    回复长度: ${res.content.length} 字符`);
  });

  await runTest('代码生成', async () => {
    const res = await collectSSE('POST', '/api/v1/chat/completions', {
      messages: [{ role: 'user', content: '用 JavaScript 写一个快速排序函数' }],
      model: 'MiniMax-M2.7'
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    const hasCode = res.content.includes('function') || res.content.includes('=>') || res.content.includes('const ');
    assertTrue(hasCode, `应包含代码，实际: ${res.content.substring(0, 100)}...`);
    console.log(`    包含代码: ${hasCode}`);
  });

  await runTest('多轮对话上下文理解', async () => {
    const res = await collectSSE('POST', '/api/v1/chat/completions', {
      messages: [
        { role: 'user', content: '我最喜欢的颜色是蓝色' },
        { role: 'assistant', content: '好的，我记住你喜欢蓝色了。' },
        { role: 'user', content: '我刚才说我喜欢什么颜色？' }
      ],
      model: 'MiniMax-M2.7'
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    const mentionsBlue = res.content.toLowerCase().includes('蓝') || res.content.toLowerCase().includes('blue');
    assertTrue(mentionsBlue, `应记住蓝色，实际: ${res.content.substring(0, 100)}...`);
    console.log(`    记住上下文: ${mentionsBlue}`);
  });
}

// ========== 2. MiniMax Agent 执行测试 ==========

async function testMiniMaxAgentExecution() {
  console.log('\n========================================');
  console.log('2. MiniMax Agent 执行测试');
  console.log('========================================\n');

  let sessionId;

  await runTest('创建 MiniMax Agent 会话', async () => {
    const res = await request('POST', '/api/minimax-agent/session', {
      model: 'MiniMax-M2.7',
      maxSteps: 5,
      showThinking: true
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertContains(res.data, 'sessionId', '应返回 sessionId');
    sessionId = res.data.sessionId;
    console.log(`    sessionId: ${sessionId}`);
  });

  if (sessionId) {
    await runTest('Agent 执行简单任务', async () => {
      const res = await request('POST', '/api/minimax-agent/execute', {
        sessionId,
        task: '你好，请介绍一下你自己'
      });
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('Agent 执行代码任务', async () => {
      const res = await request('POST', '/api/minimax-agent/execute', {
        sessionId,
        task: '写一个计算斐波那契数列的函数'
      });
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('获取 Agent 会话状态', async () => {
      const res = await request('GET', `/api/minimax-agent/session/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
      assertContains(res.data, 'stats', '应返回统计信息');
    });

    await runTest('获取 Agent 工具列表', async () => {
      const res = await request('GET', '/api/minimax-agent/tools');
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
      assertTrue(Array.isArray(res.data.tools), 'tools 应为数组');
      console.log(`    工具数量: ${res.data.tools?.length}`);
    });

    await runTest('删除 Agent 会话', async () => {
      const res = await request('DELETE', `/api/minimax-agent/session/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });
  }
}

// ========== 3. Enhanced Agent 执行测试 ==========

async function testEnhancedAgentExecution() {
  console.log('\n========================================');
  console.log('3. Enhanced Agent 执行测试');
  console.log('========================================\n');

  let sessionId;

  await runTest('Enhanced Agent 执行任务', async () => {
    const res = await request('POST', '/api/enhanced-agent/execute', {
      task: '解释什么是机器学习',
      context: { userId: 'test_user', domain: 'education' }
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(res.data.success, 'success 应为 true');
    sessionId = res.data.sessionId;
    // Enhanced Agent 返回 result.finalResult
    const response = res.data.result?.finalResult || res.data.result?.response || res.data.result;
    assertTrue(response && response.length > 0, '应返回响应');
    console.log(`    sessionId: ${sessionId}`);
    console.log(`    回复: ${String(response).substring(0, 80)}...`);
  });

  if (sessionId) {
    await runTest('获取会话状态', async () => {
      const res = await request('GET', `/api/enhanced-agent/status/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
      assertContains(res.data, 'status', '应返回状态');
    });

    await runTest('创建检查点', async () => {
      const res = await request('POST', `/api/enhanced-agent/checkpoint/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
      assertContains(res.data, 'checkpoint', '应返回检查点');
    });

    await runTest('列出检查点', async () => {
      const res = await request('GET', `/api/enhanced-agent/checkpoints/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
      assertTrue(Array.isArray(res.data.checkpoints), 'checkpoints 应为数组');
    });

    await runTest('获取记忆', async () => {
      const res = await request('GET', `/api/enhanced-agent/memory/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('搜索记忆', async () => {
      const res = await request('POST', `/api/enhanced-agent/memory/${sessionId}/search`, {
        query: 'test',
        limit: 5
      });
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('提升重要记忆', async () => {
      const res = await request('POST', `/api/enhanced-agent/memory/${sessionId}/promote`, {
        content: '用户偏好长回答',
        type: 'preference',
        importance: 8
      });
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('暂停会话', async () => {
      const res = await request('POST', `/api/enhanced-agent/pause/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('恢复会话', async () => {
      const res = await request('POST', `/api/enhanced-agent/resume/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });

    await runTest('列出所有会话', async () => {
      const res = await request('GET', '/api/enhanced-agent/sessions');
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
      assertTrue(Array.isArray(res.data.sessions), 'sessions 应为数组');
    });

    await runTest('删除会话', async () => {
      const res = await request('DELETE', `/api/enhanced-agent/session/${sessionId}`);
      assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    });
  }
}

// ========== 4. Multi-Agent 团队协作测试 ==========

async function testMultiAgentTeamwork() {
  console.log('\n========================================');
  console.log('4. Multi-Agent 团队协作测试');
  console.log('========================================\n');

  await runTest('获取 Agent 模板', async () => {
    const res = await request('GET', '/api/multiagent/templates');
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    // 模板可能是对象或数组
    const templates = res.data.agentTemplates || res.data.templates || res.data;
    const templateCount = typeof templates === 'object' ? Object.keys(templates).length : (Array.isArray(templates) ? templates.length : 0);
    assertTrue(templateCount > 0, '应有模板');
    console.log(`    Agent 模板: ${templateCount}`);
    if (res.data.taskTemplates) {
      const taskCount = typeof res.data.taskTemplates === 'object' ? Object.keys(res.data.taskTemplates).length : res.data.taskTemplates.length;
      console.log(`    Task 模板: ${taskCount}`);
    }
  });

  await runTest('创建研究员 Agent', async () => {
    const res = await request('POST', '/api/multiagent/agent', {
      role: 'AI研究员',
      goal: '研究和分析最新 AI 技术趋势',
      backstory: '你是世界顶尖的 AI 研究员，擅长深度技术分析',
      tools: ['web_search', 'data_analysis']
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    console.log(`    Agent ID: ${res.data.agent?.id}`);
  });

  await runTest('创建分析师 Agent', async () => {
    const res = await request('POST', '/api/multiagent/agent', {
      role: '数据分析师',
      goal: '分析数据并生成报告',
      backstory: '你擅长从数据中提取洞察',
      tools: ['data_analysis']
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    console.log(`    Agent ID: ${res.data.agent?.id}`);
  });

  await runTest('创建研究任务', async () => {
    const res = await request('POST', '/api/multiagent/task', {
      description: '研究大语言模型最新进展',
      expectedOutput: '技术趋势分析报告'
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    console.log(`    Task ID: ${res.data.task?.id}`);
  });

  await runTest('创建分析任务', async () => {
    const res = await request('POST', '/api/multiagent/task', {
      description: '分析 AI 在企业中的应用案例',
      expectedOutput: '应用案例报告'
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
  });

  await runTest('创建研究团队 Crew', async () => {
    const res = await request('POST', '/api/multiagent/crew', {
      name: 'AI研究团队',
      process: 'sequential',
      verbose: true
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    console.log(`    Crew ID: ${res.data.crew?.id}`);
  });

  await runTest('获取 Crew 列表', async () => {
    const res = await request('GET', '/api/multiagent/crews');
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(res.data.count >= 1, `应有至少 1 个 Crew`);
    console.log(`    Crew 数量: ${res.data.count}`);
  });

  await runTest('创建增强引擎', async () => {
    const res = await request('POST', '/api/multiagent/engine', {
      sessionId: `test_engine_${Date.now()}`,
      options: { maxIterations: 10 }
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    console.log(`    引擎 sessionId: ${res.data.engine?.sessionId}`);
  });
}

// ========== 5. A2A Agent 间通信测试 ==========

async function testA2ACommunication() {
  console.log('\n========================================');
  console.log('5. A2A Agent 间通信测试');
  console.log('========================================\n');

  // 注册两个 Agent
  const agent1 = `agent_alpha_${Date.now()}`;
  const agent2 = `agent_beta_${Date.now()}`;

  await runTest('注册 Agent Alpha', async () => {
    const res = await request('POST', '/api/a2a/agents/register', {
      id: agent1,
      name: 'Alpha',
      type: 'coordinator',
      capabilities: ['task_planning']
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
  });

  await runTest('注册 Agent Beta', async () => {
    const res = await request('POST', '/api/a2a/agents/register', {
      id: agent2,
      name: 'Beta',
      type: 'executor',
      capabilities: ['code_generation']
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
  });

  await runTest('Alpha 发送消息给 Beta', async () => {
    const res = await request('POST', '/api/a2a/send', {
      from: agent1,
      to: agent2,
      type: 'message.send',
      payload: { content: '请帮我生成一个 Web 服务器代码' }
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertContains(res.data, 'messageId', '应返回 messageId');
  });

  await runTest('Beta 接收消息', async () => {
    const res = await request('GET', `/api/a2a/receive?agentId=${agent2}&clear=true`);
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(res.data.count >= 1, '应至少收到 1 条消息');
    console.log(`    收到消息: ${res.data.count} 条`);
  });

  await runTest('Alpha 委托任务给 Beta', async () => {
    const res = await request('POST', '/api/a2a/send', {
      from: agent1,
      to: agent2,
      type: 'task.delegate',
      payload: {
        title: '代码生成任务',
        description: '生成一个 Express.js REST API',
        input: { framework: 'express', endpoints: ['users', 'products'] }
      },
      priority: 1,
      timeout: 60000
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    // 任务委托返回 task.id 而不是 taskId
    const taskId = res.data.task?.id || res.data.taskId;
    assertTrue(taskId, `应返回 taskId，实际: ${JSON.stringify(res.data).substring(0, 100)}`);
    console.log(`    任务 ID: ${taskId}`);
  });

  await runTest('获取任务列表', async () => {
    const res = await request('GET', '/api/a2a/tasks?limit=10');
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(Array.isArray(res.data.tasks), 'tasks 应为数组');
    console.log(`    任务数量: ${res.data.count}`);
  });

  await runTest('同步 Agent 状态', async () => {
    const res = await request('POST', '/api/a2a/status/sync', {
      agentId: agent1,
      status: 'busy',
      metadata: { currentTask: 'delegating' }
    });
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
  });

  await runTest('获取未读消息数', async () => {
    const res = await request('GET', `/api/a2a/unread/${agent2}`);
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
    assertTrue(typeof res.data.unreadCount === 'number', 'unreadCount 应为数字');
  });

  // 清理
  await runTest('注销 Agent Alpha', async () => {
    const res = await request('POST', `/api/a2a/agents/${agent1}/unregister`);
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
  });

  await runTest('注销 Agent Beta', async () => {
    const res = await request('POST', `/api/a2a/agents/${agent2}/unregister`);
    assertTrue(res.status === 200, `状态码应为 200，实际 ${res.status}`);
  });
}

// ========== 6. Agent 架构评估 ==========

async function evaluateAgentArchitecture() {
  console.log('\n========================================');
  console.log('6. Agent 架构评估');
  console.log('========================================\n');

  const evaluation = {
    conversation: { score: 0, max: 5, notes: [] },
    agentExecution: { score: 0, max: 10, notes: [] },
    multiAgent: { score: 0, max: 10, notes: [] },
    a2aCommunication: { score: 0, max: 10, notes: [] }
  };

  // 计算分数
  for (const r of results) {
    if (r.name.includes('问候') || r.name.includes('知识问答') || r.name.includes('代码生成') || r.name.includes('多轮对话')) {
      if (r.status === 'pass') evaluation.conversation.score++;
    }
    if (r.name.includes('MiniMax') || r.name.includes('Enhanced') || r.name.includes('会话') || r.name.includes('检查点') || r.name.includes('记忆')) {
      if (r.status === 'pass') evaluation.agentExecution.score++;
    }
    if (r.name.includes('Crew') || r.name.includes('团队') || r.name.includes('模板') || r.name.includes('引擎')) {
      if (r.status === 'pass') evaluation.multiAgent.score++;
    }
    if (r.name.includes('Agent') && (r.name.includes('注册') || r.name.includes('发送') || r.name.includes('委托') || r.name.includes('消息'))) {
      if (r.status === 'pass') evaluation.a2aCommunication.score++;
    }
  }

  // 输出评估结果
  console.log('\n【架构评估报告】\n');
  console.log(`日常对话能力: ${evaluation.conversation.score}/${evaluation.conversation.max}`);
  console.log(`Agent 执行能力: ${evaluation.agentExecution.score}/${evaluation.agentExecution.max}`);
  console.log(`多 Agent 协作: ${evaluation.multiAgent.score}/${evaluation.multiAgent.max}`);
  console.log(`A2A 通信能力: ${evaluation.a2aCommunication.score}/${evaluation.a2aCommunication.max}`);

  const totalScore = evaluation.conversation.score + evaluation.agentExecution.score + evaluation.multiAgent.score + evaluation.a2aCommunication.score;
  const maxScore = evaluation.conversation.max + evaluation.agentExecution.max + evaluation.multiAgent.max + evaluation.a2aCommunication.max;
  const percentage = Math.round((totalScore / maxScore) * 100);

  console.log(`\n综合评分: ${totalScore}/${maxScore} (${percentage}%)`);

  if (percentage >= 80) {
    console.log('评价: 优秀 - Agent 架构工作正常');
  } else if (percentage >= 60) {
    console.log('评价: 良好 - Agent 架构基本可用');
  } else if (percentage >= 40) {
    console.log('评价: 一般 - 部分功能需要修复');
  } else {
    console.log('评价: 较差 - 需要重大改进');
  }

  // 分析失败的测试
  const failedTests = results.filter(r => r.status === 'fail');
  if (failedTests.length > 0) {
    console.log('\n【失败测试分析】');
    const failedByCategory = {};
    for (const t of failedTests) {
      let cat = '其他';
      if (t.name.includes('对话')) cat = '对话';
      else if (t.name.includes('Agent')) cat = 'Agent';
      else if (t.name.includes('Crew') || t.name.includes('团队')) cat = '多Agent';
      else if (t.name.includes('消息') || t.name.includes('A2A')) cat = 'A2A通信';
      failedByCategory[cat] = (failedByCategory[cat] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(failedByCategory)) {
      console.log(`  ${cat}: ${count} 个失败`);
    }
  }

  return { evaluation, totalScore, maxScore, percentage };
}

// ========== 主函数 ==========

async function runAllTests() {
  console.log('================================================');
  console.log('MiniMax API 端到端对话与 Agent 架构测试');
  console.log('================================================');

  const startTime = Date.now();

  try {
    await testDailyConversation();
    await testMiniMaxAgentExecution();
    await testEnhancedAgentExecution();
    await testMultiAgentTeamwork();
    await testA2ACommunication();

    const duration = Date.now() - startTime;
    console.log('\n========================================');
    console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
    console.log(`耗时: ${duration}ms`);
    console.log('========================================\n');

    const evaluation = await evaluateAgentArchitecture();

    return { passed, failed, evaluation };
  } catch (error) {
    console.error('测试执行失败:', error);
    process.exit(1);
  }
}

// 运行
runAllTests()
  .then(({ passed, failed, evaluation }) => {
    console.log('\n================================================');
    console.log('测试结果已记录到测试报告');
    console.log('================================================');
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
