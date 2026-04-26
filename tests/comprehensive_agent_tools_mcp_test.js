/**
 * 综合测试套件：Agent、Tools、MCP 模块
 * 目标：60+ 测试用例
 *
 * 运行方式: node tests/comprehensive_agent_tools_mcp_test.js
 */

const http = require('http');
const path = require('path');

const BASE_URL = 'http://localhost:30000';
const results = [];
let testIndex = 0;
let passCount = 0;
let failCount = 0;
let skipCount = 0;

// ============ 辅助函数 ============

function makeRequest(method, path, body = null, headers = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          let parsed = data ? JSON.parse(data) : { raw: data };
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data }, headers: res.headers });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ status: 0, data: { error: 'Request timeout' } });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function makeSSERequest(method, path, body = null, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    };

    const req = http.request(options, (res) => {
      // SSE 连接成功
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        // 等待初始数据
        const timer = setTimeout(() => {
          req.destroy();
          resolve({ status: 200, data: { event: 'connected', received: data.substring(0, 200) }, streaming: true });
        }, 1500);
        res.on('error', () => { clearTimeout(timer); resolve({ status: 200, data: { event: 'connected' }, streaming: true }); });
      } else {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data: { raw: data } });
          }
        });
      }
    });

    req.on('error', (e) => {
      resolve({ status: 0, data: { error: e.message } });
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ status: 0, data: { error: 'SSE timeout' } });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function makeNonBlockingRequest(method, path, body = null, timeout = 3000) {
  return new Promise((resolve) => {
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
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', () => {
      resolve({ status: 0, data: { error: 'connection error' } });
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ status: 0, data: { error: 'timeout' } });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn, options = {}) {
  testIndex++;
  const id = String(testIndex).padStart(2, '0');
  const { expectedStatus, skipStreamingCheck } = options;

  process.stdout.write(`  [${id}] ${name} ... `);

  try {
    const result = await fn();
    let ok;

    if (expectedStatus) {
      ok = result.status === expectedStatus;
    } else {
      ok = result.status >= 200 && result.status < 300;
    }

    if (ok) {
      passCount++;
      // 显示成功且关键数据
      let snippet = '';
      if (result.data && result.data.success !== undefined) {
        snippet = ` success=${result.data.success}`;
      } else if (result.data && result.data.error) {
        snippet = ` "${result.data.error}"`;
      } else if (result.data && result.data.sessionId) {
        snippet = ` sessionId=${result.data.sessionId.substring(0, 20)}...`;
      } else if (result.data && (result.data.tools || result.data.agents || result.data.tasks)) {
        const count = (result.data.tools || result.data.agents || result.data.tasks || []).length;
        snippet = ` count=${count}`;
      } else if (result.data && result.data.stats) {
        snippet = ' stats={...}';
      }
      console.log(`\x1b[32mPASS\x1b[0m (${result.status})${snippet}`);
      results.push({ id, name, status: result.status, ok: true, data: result.data });
    } else {
      failCount++;
      const errMsg = result.data?.error || result.data?.success || JSON.stringify(result.data).substring(0, 80);
      console.log(`\x1b[31mFAIL\x1b[0m (${result.status}) - expected ${expectedStatus || '2xx'}, got: ${errMsg}`);
      results.push({ id, name, status: result.status, ok: false, expected: expectedStatus, data: result.data });
    }
  } catch (e) {
    failCount++;
    console.log(`\x1b[31mERROR\x1b[0m (${e.message})`);
    results.push({ id, name, status: 0, ok: false, error: e.message });
  }
}

async function testStream(name, fn, options = {}) {
  testIndex++;
  const id = String(testIndex).padStart(2, '0');
  const { expectedStatus = 200 } = options;
  process.stdout.write(`  [${id}] ${name} ... `);
  try {
    const result = await fn();
    const ok = result.status === expectedStatus;
    if (ok) {
      passCount++;
      console.log(`\x1b[32mPASS\x1b[0m (${result.status}) - ${result.streaming ? 'SSE connected' : 'stream ok'}`);
      results.push({ id, name, status: result.status, ok: true, streaming: result.streaming, data: result.data });
    } else {
      failCount++;
      console.log(`\x1b[31mFAIL\x1b[0m (${result.status}) - expected ${expectedStatus}`);
      results.push({ id, name, status: result.status, ok: false, data: result.data });
    }
  } catch (e) {
    failCount++;
    console.log(`\x1b[31mERROR\x1b[0m (${e.message})`);
    results.push({ id, name, status: 0, ok: false, error: e.message });
  }
}

// ============ 测试套件 ============

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('  综合测试套件：Agent、Tools、MCP 模块');
  console.log('='.repeat(80) + '\n');

  const testToolName = `TestTool_${Date.now()}`;
  const testToolName2 = `TestTool2_${Date.now()}`;

  // ========== Module 1: Agent Engine Tests ==========
  console.log('\n\x1b[1;36m[模块 1] Agent Engine Tests (/api/enhanced-agent)\x1b[0m\n');

  // 1. Create session
  let sessionId = null;
  await test('POST /enhanced-agent/execute - 创建会话并执行简单任务', async () => {
    const res = await makeRequest('POST', '/api/enhanced-agent/execute', {
      task: 'Hello, reply with "hi" only',
      context: {}
    });
    if (res.data && res.data.sessionId) sessionId = res.data.sessionId;
    return res;
  });

  // 2. Session status (real session)
  if (sessionId) {
    await test(`GET /enhanced-agent/status/:sessionId - 获取会话状态`, async () => {
      return await makeRequest('GET', `/api/enhanced-agent/status/${sessionId}`);
    });
  } else {
    skipCount++;
    console.log('  [SKIP] Session status (no session created)');
  }

  // 3. Agent sessions list
  await test('GET /enhanced-agent/sessions - 列出所有会话', async () => {
    return await makeRequest('GET', '/api/enhanced-agent/sessions');
  });

  // 4. Agent execute with empty task
  await test('POST /enhanced-agent/execute - 空 task 应返回 400', async () => {
    return await makeRequest('POST', '/api/enhanced-agent/execute', { task: '' });
  }, { expectedStatus: 400 });

  // 5. Agent execute missing task
  await test('POST /enhanced-agent/execute - 缺少 task 应返回 400', async () => {
    return await makeRequest('POST', '/api/enhanced-agent/execute', {});
  }, { expectedStatus: 400 });

  // 6. Agent execute with context
  await test('POST /enhanced-agent/execute - 带 context 参数', async () => {
    return await makeRequest('POST', '/api/enhanced-agent/execute', {
      task: 'What is 2+2?',
      context: { mode: 'test' }
    });
  });

  // 7. Agent pause (non-existent session should 404)
  await test('POST /enhanced-agent/pause/:sessionId - 不存在的会话应返回 404', async () => {
    return await makeRequest('POST', '/api/enhanced-agent/pause/nonexistent-session-xyz');
  }, { expectedStatus: 404 });

  // 8. Agent checkpoint
  if (sessionId) {
    await test('POST /enhanced-agent/checkpoint/:sessionId - 创建检查点', async () => {
      return await makeRequest('POST', `/api/enhanced-agent/checkpoint/${sessionId}`);
    });
  }

  // 9. Agent checkpoints list
  if (sessionId) {
    await test('GET /enhanced-agent/checkpoints/:sessionId - 列出检查点', async () => {
      return await makeRequest('GET', `/api/enhanced-agent/checkpoints/${sessionId}`);
    });
  }

  // 10. Agent confirmations
  if (sessionId) {
    await test('GET /enhanced-agent/confirmations/:sessionId - 获取待确认项', async () => {
      return await makeRequest('GET', `/api/enhanced-agent/confirmations/${sessionId}`);
    });
  }

  // 11. Agent memory
  if (sessionId) {
    await test('GET /enhanced-agent/memory/:sessionId - 获取记忆', async () => {
      return await makeRequest('GET', `/api/enhanced-agent/memory/${sessionId}`);
    });
  }

  // 12. Agent memory search
  if (sessionId) {
    await test('POST /enhanced-agent/memory/:sessionId/search - 搜索记忆', async () => {
      return await makeRequest('POST', `/api/enhanced-agent/memory/${sessionId}/search`, {
        query: 'test',
        limit: 5
      });
    });
  }

  // 13. Agent memory promote
  if (sessionId) {
    await test('POST /enhanced-agent/memory/:sessionId/promote - 提升记忆', async () => {
      return await makeRequest('POST', `/api/enhanced-agent/memory/${sessionId}/promote`, {
        content: 'important test memory',
        type: 'fact',
        importance: 'high'
      });
    });
  }

  // 14. Non-existent session status
  await test('GET /enhanced-agent/status/nonexistent - 不存在的会话应返回 404', async () => {
    return await makeRequest('GET', '/api/enhanced-agent/status/nonexistent-abc123');
  }, { expectedStatus: 404 });

  // 15. Delete session
  if (sessionId) {
    await test('DELETE /enhanced-agent/session/:sessionId - 删除会话', async () => {
      return await makeRequest('DELETE', `/api/enhanced-agent/session/${sessionId}`);
    });
  }

  // 16. Resume non-existent
  await test('POST /enhanced-agent/resume/nonexistent - 恢复不存在的会话应返回 404', async () => {
    return await makeRequest('POST', '/api/enhanced-agent/resume/nonexistent-xyz');
  }, { expectedStatus: 404 });

  // 17. Persistence sessions
  await test('GET /enhanced-agent/persistence/sessions - 列出持久化会话', async () => {
    return await makeRequest('GET', '/api/enhanced-agent/persistence/sessions');
  });

  // 18. Persistence recoverable
  await test('GET /enhanced-agent/persistence/recoverable - 获取可恢复会话', async () => {
    return await makeRequest('GET', '/api/enhanced-agent/persistence/recoverable');
  });

  // 19. Persistence cleanup
  await test('POST /enhanced-agent/persistence/cleanup - 清理过期会话', async () => {
    return await makeRequest('POST', '/api/enhanced-agent/persistence/cleanup', { maxAgeDays: 7 });
  });

  // 20. Restore non-existent checkpoint
  if (sessionId) {
    await test('POST /enhanced-agent/restore/:sessionId/:checkpointId - 恢复不存在的检查点', async () => {
      return await makeRequest('POST', `/api/enhanced-agent/restore/${sessionId}/nonexistent-checkpoint`);
    });
  }

  // ========== Module 2: MiniMax Agent Tests ==========
  console.log('\n\x1b[1;36m[模块 2] MiniMax Agent Tests (/api/minimax-agent)\x1b[0m\n');

  let mmSessionId = null;
  await test('POST /minimax-agent/session - 创建 MiniMax 会话', async () => {
    const res = await makeRequest('POST', '/api/minimax-agent/session', {
      maxSteps: 5,
      showThinking: false
    });
    if (res.data && res.data.sessionId) mmSessionId = res.data.sessionId;
    return res;
  });

  await test('GET /minimax-agent/tools - 列出可用工具', async () => {
    return await makeRequest('GET', '/api/minimax-agent/tools');
  });

  if (mmSessionId) {
    await test('GET /minimax-agent/session/:sessionId - 获取会话状态', async () => {
      return await makeRequest('GET', `/api/minimax-agent/session/${mmSessionId}`);
    });

    await test('DELETE /minimax-agent/session/:sessionId - 删除会话', async () => {
      return await makeRequest('DELETE', `/api/minimax-agent/session/${mmSessionId}`);
    });
  }

  await test('GET /minimax-agent/session/nonexistent - 不存在会话应返回 404', async () => {
    return await makeRequest('GET', '/api/minimax-agent/session/nonexistent-mmsession');
  }, { expectedStatus: 404 });

  // ========== Module 3: Multiagent Tests ==========
  console.log('\n\x1b[1;36m[模块 3] Multiagent Tests (/api/multiagent)\x1b[0m\n');

  await test('GET /multiagent/health - 健康检查', async () => {
    return await makeRequest('GET', '/api/multiagent/health');
  });

  await test('GET /multiagent/templates - 获取模板列表', async () => {
    return await makeRequest('GET', '/api/multiagent/templates');
  });

  await test('GET /multiagent/agent-templates - 获取 Agent 模板', async () => {
    return await makeRequest('GET', '/api/multiagent/agent-templates');
  });

  await test('POST /multiagent/agent - 创建 Agent', async () => {
    return await makeRequest('POST', '/api/multiagent/agent', {
      role: 'test-agent',
      goal: 'testing role and goal'
    });
  });

  await test('POST /multiagent/task - 创建 Task', async () => {
    return await makeRequest('POST', '/api/multiagent/task', {
      description: 'test task description',
      expectedOutput: 'test output'
    });
  });

  let crewId = null;
  await test('POST /multiagent/crew - 创建 Crew', async () => {
    const res = await makeRequest('POST', '/api/multiagent/crew', {
      name: 'test-crew',
      agents: [],
      tasks: [],
      process: 'sequential'
    });
    if (res.data && res.data.crew && res.data.crew.id) crewId = res.data.crew.id;
    return res;
  });

  await test('GET /multiagent/crews - 列出所有 Crew', async () => {
    return await makeRequest('GET', '/api/multiagent/crews');
  });

  if (crewId) {
    await test('GET /multiagent/crew/:id - 获取 Crew 状态', async () => {
      return await makeRequest('GET', `/api/multiagent/crew/${crewId}`);
    });

    await test('POST /multiagent/crew/:crewId/execute - 执行 Crew', async () => {
      return await makeRequest('POST', `/api/multiagent/crew/${crewId}/execute`, { task: 'test task' });
    });

    await test('DELETE /multiagent/crew/:id - 删除 Crew', async () => {
      return await makeRequest('DELETE', `/api/multiagent/crew/${crewId}`);
    });
  }

  let engineSessionId = null;
  await test('POST /multiagent/engine - 创建增强引擎', async () => {
    const res = await makeRequest('POST', '/api/multiagent/engine', {
      sessionId: `engine-test-${Date.now()}`
    });
    if (res.data && res.data.engine && res.data.engine.sessionId) {
      engineSessionId = res.data.engine.sessionId;
    }
    return res;
  });

  if (engineSessionId) {
    await test('GET /multiagent/engine/:sessionId - 获取引擎状态', async () => {
      return await makeRequest('GET', `/api/multiagent/engine/${engineSessionId}`);
    });

    await test('POST /multiagent/engine/:sessionId/execute - 执行引擎任务', async () => {
      return await makeRequest('POST', `/api/multiagent/engine/${engineSessionId}/execute`, { task: 'test task' });
    });

    await test('GET /multiagent/engine/:sessionId/memory - 获取记忆统计', async () => {
      return await makeRequest('GET', `/api/multiagent/engine/${engineSessionId}/memory`);
    });

    await test('POST /multiagent/engine/:sessionId/memory/search - 搜索记忆', async () => {
      return await makeRequest('POST', `/api/multiagent/engine/${engineSessionId}/memory/search`, { query: 'test' });
    });

    await test('POST /multiagent/engine/:sessionId/pause - 暂停引擎', async () => {
      return await makeRequest('POST', `/api/multiagent/engine/${engineSessionId}/pause`);
    });

    await test('POST /multiagent/engine/:sessionId/resume - 恢复引擎', async () => {
      return await makeRequest('POST', `/api/multiagent/engine/${engineSessionId}/resume`);
    });

    await test('POST /multiagent/engine/:sessionId/checkpoint - 创建检查点', async () => {
      return await makeRequest('POST', `/api/multiagent/engine/${engineSessionId}/checkpoint`);
    });

    await test('GET /multiagent/engine/:sessionId/checkpoints - 列出检查点', async () => {
      return await makeRequest('GET', `/api/multiagent/engine/${engineSessionId}/checkpoints`);
    });
  }

  await test('GET /multiagent/recovery/handlers - 获取恢复处理器', async () => {
    return await makeRequest('GET', '/api/multiagent/recovery/handlers');
  });

  await test('GET /multiagent/tools - 获取可用工具', async () => {
    return await makeRequest('GET', '/api/multiagent/tools');
  });

  // 工具不存在时返回 200 并在 result 中包含错误（优雅降级）
  await test('POST /multiagent/tools/execute - 工具不存在时返回优雅错误', async () => {
    return await makeRequest('POST', '/api/multiagent/tools/execute', {
      toolName: 'nonexistent-tool-xyz',
      input: {}
    });
  });

  // ========== Module 4: Tools Registry Tests ==========
  console.log('\n\x1b[1;36m[模块 4] Tools Registry Tests (/api/admin/tools)\x1b[0m\n');

  await test('GET /api/admin/tools - 列出所有工具', async () => {
    return await makeRequest('GET', '/api/admin/tools');
  });

  await test('GET /api/admin/tools/stats - 获取工具统计', async () => {
    return await makeRequest('GET', '/api/admin/tools/stats');
  });

  await test('GET /api/admin/tools?category=web - 按分类过滤', async () => {
    return await makeRequest('GET', '/api/admin/tools?category=web');
  });

  await test('GET /api/admin/tools?keyword=search - 按关键词搜索', async () => {
    return await makeRequest('GET', '/api/admin/tools?keyword=search');
  });

  await test('GET /api/admin/tools/categories - 获取分类列表', async () => {
    return await makeRequest('GET', '/api/admin/tools/categories');
  });

  await test('GET /api/admin/tools/categories/list - 按分类获取工具', async () => {
    return await makeRequest('GET', '/api/admin/tools/categories/list');
  });

  await test('POST /api/admin/tools/recommend - 工具推荐(query)', async () => {
    return await makeRequest('POST', '/api/admin/tools/recommend', { query: 'search the web' });
  });

  await test('POST /api/admin/tools/recommend - 工具推荐(intent)', async () => {
    return await makeRequest('POST', '/api/admin/tools/recommend', { intent: 'search' });
  });

  await test('GET /api/admin/tools/nonexistent-tool-xyz - 获取不存在的工具应返回 404', async () => {
    return await makeRequest('GET', '/api/admin/tools/nonexistent-tool-xyz');
  }, { expectedStatus: 404 });

  await test('POST /api/admin/tools/register - 缺少名称应返回 400', async () => {
    return await makeRequest('POST', '/api/admin/tools/register', { description: 'no name tool' });
  }, { expectedStatus: 400 });

  // Note: Tool registration via API requires passing an actual function reference,
  // which cannot be done over HTTP. These would need integration tests with direct
  // module loading. We test the registration logic via the tool test endpoint instead.

  // Test execution of a built-in tool
  const builtInTools = ['web_search', 'calculator', 'weather', 'file_read'];
  for (const toolName of builtInTools) {
    const r = await makeRequest('GET', '/api/admin/tools');
    const tools = r.data?.data?.tools || [];
    const exists = tools.find(t => t.name === toolName);
    if (exists) {
      await test(`POST /api/admin/tools/:name/test - 测试内置工具 ${toolName}`, async () => {
        return await makeRequest('POST', `/api/admin/tools/${toolName}/test`, {
          params: toolName === 'calculator' ? { expression: '2+2' } : {},
          timeout: 5000
        });
      });
    }
  }

  // Test non-existent tool operations
  await test('PUT /api/admin/tools/nonexistent - 更新不存在的工具应返回 404', async () => {
    return await makeRequest('PUT', '/api/admin/tools/nonexistent-tool-xyz', { description: 'updated' });
  }, { expectedStatus: 404 });

  await test('PATCH /api/admin/tools/nonexistent - 禁用不存在的工具应返回 404', async () => {
    return await makeRequest('PATCH', '/api/admin/tools/nonexistent-tool-xyz', { enabled: false });
  }, { expectedStatus: 404 });

  await test('DELETE /api/admin/tools/nonexistent - 删除不存在的工具应返回 404', async () => {
    return await makeRequest('DELETE', '/api/admin/tools/nonexistent-tool-xyz');
  }, { expectedStatus: 404 });

  await test('POST /api/admin/tools/nonexistent/test - 测试不存在的工具应返回 404', async () => {
    return await makeRequest('POST', '/api/admin/tools/nonexistent-tool-xyz/test', { params: {} });
  }, { expectedStatus: 404 });

  // ========== Module 5: MCP Server Tests ==========
  console.log('\n\x1b[1;36m[模块 5] MCP Server Tests (/api/mcp)\x1b[0m\n');

  await test('GET /api/mcp/status - 获取 MCP 状态', async () => {
    return await makeRequest('GET', '/api/mcp/status');
  });

  await test('GET /api/mcp/tools - 列出 MCP 工具', async () => {
    return await makeRequest('GET', '/api/mcp/tools');
  });

  await test('GET /api/mcp/categories - 获取 MCP 工具分类', async () => {
    return await makeRequest('GET', '/api/mcp/categories');
  });

  await test('POST /api/mcp/call - 缺少工具名称应返回 400', async () => {
    return await makeRequest('POST', '/api/mcp/call', {});
  }, { expectedStatus: 400 });

  // MCP 工具不存在时返回 200 并在 result 中包含错误（优雅降级）
  await test('POST /api/mcp/call - 工具不存在时返回优雅错误', async () => {
    return await makeRequest('POST', '/api/mcp/call', { toolName: 'nonexistent-mcp-tool', args: {} });
  });

  await test('POST /api/mcp/connect - 缺少参数应返回 400', async () => {
    return await makeRequest('POST', '/api/mcp/connect', {});
  }, { expectedStatus: 400 });

  await test('POST /api/mcp/disconnect - 缺少服务器名称应返回 400', async () => {
    return await makeRequest('POST', '/api/mcp/disconnect', {});
  }, { expectedStatus: 400 });

  // ========== Module 6: A2A Protocol Tests ==========
  console.log('\n\x1b[1;36m[模块 6] A2A Protocol Tests (/api/a2a)\x1b[0m\n');

  await test('GET /api/a2a/status - 获取 A2A 服务状态', async () => {
    return await makeRequest('GET', '/api/a2a/status');
  });

  await test('GET /api/a2a/agents - 列出所有 Agent', async () => {
    return await makeRequest('GET', '/api/a2a/agents');
  });

  let testAgentId = `test-agent-${Date.now()}`;
  await test('POST /api/a2a/agents/register - 注册 Agent', async () => {
    return await makeRequest('POST', '/api/a2a/agents/register', {
      id: testAgentId,
      name: 'Test Agent',
      type: 'test',
      capabilities: ['chat']
    });
  });

  await test(`GET /api/a2a/agents/:agentId - 获取 Agent 详情`, async () => {
    return await makeRequest('GET', `/api/a2a/agents/${testAgentId}`);
  });

  await test(`POST /api/a2a/agents/:agentId/heartbeat - Agent 心跳`, async () => {
    return await makeRequest('POST', `/api/a2a/agents/${testAgentId}/heartbeat`);
  });

  await test('GET /api/a2a/agents/nonexistent - 获取不存在的 Agent 应返回 404', async () => {
    return await makeRequest('GET', '/api/a2a/agents/nonexistent-agent-xyz');
  }, { expectedStatus: 404 });

  await test('POST /api/a2a/send - 缺少 from/to 应返回 400', async () => {
    return await makeRequest('POST', '/api/a2a/send', { type: 'message.send' });
  }, { expectedStatus: 400 });

  await test('POST /api/a2a/send - 发送消息', async () => {
    return await makeRequest('POST', '/api/a2a/send', {
      from: testAgentId,
      to: testAgentId,
      type: 'message.send',
      payload: { content: 'test message' }
    });
  });

  await test(`GET /api/a2a/receive - 接收消息`, async () => {
    return await makeRequest('GET', `/api/a2a/receive?agentId=${testAgentId}`);
  });

  await test('GET /api/a2a/poll - 轮询消息(短超时)', async () => {
    return await makeNonBlockingRequest('GET', `/api/a2a/poll?agentId=${testAgentId}&timeout=500`);
  });

  await test(`GET /api/a2a/unread/:agentId - 获取未读消息数`, async () => {
    return await makeRequest('GET', `/api/a2a/unread/${testAgentId}`);
  });

  // SSE subscribe
  await testStream('GET /api/a2a/subscribe/:agentId - SSE 订阅连接测试', async () => {
    return await makeSSERequest('GET', `/api/a2a/subscribe/${testAgentId}`);
  });

  await test('GET /api/a2a/tasks - 列出任务', async () => {
    return await makeRequest('GET', '/api/a2a/tasks');
  });

  await test('GET /api/a2a/tasks/nonexistent - 获取不存在的任务应返回 404', async () => {
    return await makeRequest('GET', '/api/a2a/tasks/nonexistent-task-xyz');
  }, { expectedStatus: 404 });

  await test('GET /api/a2a/coordination/modes - 获取协调模式', async () => {
    return await makeRequest('GET', '/api/a2a/coordination/modes');
  });

  await test('POST /api/a2a/tasks/define - 创建任务定义', async () => {
    return await makeRequest('POST', '/api/a2a/tasks/define', {
      task: 'test task description',
      agentName: 'test-agent',
      taskType: 'test'
    });
  });

  await test('POST /api/a2a/tasks/define - 缺少 task 字段应返回 400', async () => {
    return await makeRequest('POST', '/api/a2a/tasks/define', { agentName: 'test-agent' });
  }, { expectedStatus: 400 });

  await test('POST /api/a2a/tasks/define/batch - 批量创建任务', async () => {
    return await makeRequest('POST', '/api/a2a/tasks/define/batch', {
      tasks: [
        { task: 'task 1', agentName: 'agent1' },
        { task: 'task 2', agentName: 'agent2' }
      ]
    });
  });

  // 空数组通过 Array.isArray 检查，但无任务可创建（返回空数组）
  await test('POST /api/a2a/tasks/define/batch - 空数组返回空结果（建议增加长度校验）', async () => {
    return await makeRequest('POST', '/api/a2a/tasks/define/batch', { tasks: [] });
  });

  // Collaboration tests - tasks need explicit short timeout else they hang indefinitely
  await test('POST /api/a2a/collaborate - 协作任务(team_leader模式)', async () => {
    return await makeNonBlockingRequest('POST', '/api/a2a/collaborate', {
      title: 'Test Collaboration',
      tasks: [
        { task: 'subtask 1', timeout: 3000 },
        { task: 'subtask 2', timeout: 3000 }
      ],
      options: { coordinationMode: 'team_leader' }
    }, 15000);
  });

  await test('POST /api/a2a/collaborate - 协作任务(collaborative模式)', async () => {
    return await makeNonBlockingRequest('POST', '/api/a2a/collaborate', {
      title: 'Test Collaboration 2',
      tasks: [{ task: 'parallel task 1', timeout: 3000 }],
      options: { coordinationMode: 'collaborative' }
    }, 15000);
  });

  await test('POST /api/a2a/collaborate - 缺少 title 应返回 400', async () => {
    return await makeRequest('POST', '/api/a2a/collaborate', { tasks: [{ task: 'some task' }] });
  }, { expectedStatus: 400 });

  await test('POST /api/a2a/collaborate - 空 tasks 应返回 400', async () => {
    return await makeRequest('POST', '/api/a2a/collaborate', { title: 'Empty Collaboration' });
  }, { expectedStatus: 400 });

  // This was the key bug fix - stats route ordering
  await test('GET /api/a2a/collaboration/stats - 获取协作统计(修复后)', async () => {
    return await makeRequest('GET', '/api/a2a/collaboration/stats');
  });

  await test('GET /api/a2a/collaboration/nonexistent - 不存在的协作应返回 404', async () => {
    return await makeRequest('GET', '/api/a2a/collaboration/nonexistent-collab-xyz');
  }, { expectedStatus: 404 });

  await test('GET /api/a2a/collaboration/nonexistent/result - 不存在的结果应返回 404', async () => {
    return await makeRequest('GET', '/api/a2a/collaboration/nonexistent-collab-xyz/result');
  }, { expectedStatus: 404 });

  await test('DELETE /api/a2a/collaboration/nonexistent - 取消不存在的协作应返回 404', async () => {
    return await makeRequest('DELETE', '/api/a2a/collaboration/nonexistent-collab-xyz');
  }, { expectedStatus: 404 });

  const testTaskId = `task-${Date.now()}`;
  await test('POST /api/a2a/progress/:taskId - 发送进度更新', async () => {
    return await makeRequest('POST', `/api/a2a/progress/${testTaskId}`, { progress: 50, metadata: { step: 1 } });
  });

  await test('POST /api/a2a/result/:taskId - 返回任务结果', async () => {
    return await makeRequest('POST', `/api/a2a/result/${testTaskId}`, { result: { output: 'test result' }, status: 'completed' });
  });

  await test('POST /api/a2a/result/:taskId - 缺少 result 字段应返回 400', async () => {
    return await makeRequest('POST', `/api/a2a/result/${testTaskId}`, {});
  }, { expectedStatus: 400 });

  await test('POST /api/a2a/status/sync - 状态同步', async () => {
    return await makeRequest('POST', '/api/a2a/status/sync', { agentId: testAgentId, status: 'busy' });
  });

  await test('POST /api/a2a/ack - 消息确认', async () => {
    return await makeRequest('POST', '/api/a2a/ack', { agentId: testAgentId, messageIds: [] });
  });

  await test(`POST /api/a2a/agents/:agentId/unregister - 注销 Agent`, async () => {
    return await makeRequest('POST', `/api/a2a/agents/${testAgentId}/unregister`);
  });

  // ========== Module 7: Global Tools /api/tools ==========
  console.log('\n\x1b[1;36m[模块 7] Global Tools Tests (/api/tools)\x1b[0m\n');

  await test('GET /api/tools - 列出所有工具(全局端点)', async () => {
    return await makeRequest('GET', '/api/tools');
  });

  // ========== Print Summary ==========
  console.log('\n' + '='.repeat(80));
  console.log('  测试结果汇总');
  console.log('='.repeat(80));
  console.log(`  总测试数: ${testIndex}`);
  console.log(`  \x1b[32m通过: ${passCount}\x1b[0m`);
  console.log(`  \x1b[31m失败: ${failCount}\x1b[0m`);
  console.log(`  通过率: ${((passCount / testIndex) * 100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');

  if (failCount > 0) {
    console.log('\x1b[31m失败的测试:\x1b[0m');
    results.filter(r => !r.ok).forEach(r => {
      const keyData = r.data?.error || r.data?.success || (typeof r.data === 'string' ? r.data.substring(0, 80) : JSON.stringify(r.data).substring(0, 120));
      console.log(`  [${r.id}] ${r.name}`);
      console.log(`       HTTP ${r.status} (expected ${r.expected || '2xx'}) | ${keyData}`);
    });
    console.log('');
  }

  // Save results
  const fs = require('fs');
  const reportPath = path.join(__dirname, 'test-results', `agent-tools-mcp-test-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: testIndex, passed: passCount, failed: failCount, rate: `${((passCount / testIndex) * 100).toFixed(1)}%` },
    results
  }, null, 2));
  console.log(`详细报告已保存: ${reportPath}\n`);

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite error:', e);
  process.exit(1);
});
