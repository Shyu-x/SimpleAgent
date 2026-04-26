/**
 * A2A API 集成测试
 *
 * 测试内容：
 * 1. Agent 注册与心跳
 * 2. 消息发送
 * 3. SSE 订阅
 * 4. 协作任务执行
 * 5. 任务状态查询
 */

const http = require('http');

// 测试配置
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 30000;

// 测试统计
let passed = 0;
let failed = 0;

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(colors.green + '✓' + colors.reset + ' ' + name);
  }).catch((e) => {
    failed++;
    console.log(colors.red + '✗' + colors.reset + ' ' + name);
    console.log('  ' + e.message);
  });
}

function describe(name, fn) {
  console.log('\n' + name + ':');
  fn();
}

function request(method, path, body = null, headers = {}) {
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
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe('A2A API - Agent 管理', () => {
  test('GET /api/a2a/agents 应该返回 Agent 列表', async () => {
    const response = await request('GET', '/api/a2a/agents');

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!Array.isArray(response.body.agents)) {
      throw new Error('应该返回 agents 数组');
    }
  });

  test('POST /api/a2a/agents/:agentId/heartbeat 应该发送心跳', async () => {
    const agentId = 'test-agent-' + Date.now();

    const response = await request('POST', `/api/a2a/agents/${agentId}/heartbeat`, {
      status: 'active',
      capabilities: ['chat', 'tool_use']
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`HTTP ${response.status}`);
    }
  });
});

describe('A2A API - 消息传递', () => {
  test('POST /api/a2a/messages/send 应该发送消息', async () => {
    const response = await request('POST', '/api/a2a/messages/send', {
      senderId: 'test-sender',
      receiverId: 'test-receiver',
      message: {
        type: 'task',
        content: '测试消息'
      }
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
    }
  });

  test('发送消息应该验证必填字段', async () => {
    const response = await request('POST', '/api/a2a/messages/send', {
      senderId: 'test-sender'
      // 缺少 receiverId 和 message
    });

    if (response.status === 200 || response.status === 201) {
      throw new Error('应该返回错误');
    }
  });
});

describe('A2A API - SSE 订阅', () => {
  test('GET /api/a2a/subscribe/:sessionId 应该返回 SSE 流', async () => {
    const sessionId = 'test-session-' + Date.now();

    const response = await fetch(`${BASE_URL}/api/a2a/subscribe/${sessionId}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType.includes('text/event-stream')) {
      throw new Error('应该返回 text/event-stream');
    }

    response.body.cancel();
  });
});

describe('A2A API - 协作任务', () => {
  test('POST /api/a2a/collaborate 应该创建协作任务', async () => {
    const response = await request('POST', '/api/a2a/collaborate', {
      collaborationId: 'collab-test-' + Date.now(),
      mode: 'team_leader',
      tasks: [
        {
          id: 'task-1',
          agentName: 'test-agent',
          taskType: 'test',
          prompt: '测试任务'
        }
      ]
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
    }
  });

  test('GET /api/a2a/coordination/modes 应该返回协调模式', async () => {
    const response = await request('GET', '/api/a2a/coordination/modes');

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body.modes) {
      throw new Error('应该返回 modes');
    }
  });
});

describe('A2A API - 任务定义', () => {
  test('POST /api/a2a/tasks/define 应该创建任务定义', async () => {
    const response = await request('POST', '/api/a2a/tasks/define', {
      taskId: 'task-def-test-' + Date.now(),
      agentName: 'test-agent',
      taskType: 'test_type',
      prompt: '测试任务定义'
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`HTTP ${response.status}`);
    }
  });

  test('POST /api/a2a/tasks/define/batch 应该批量创建任务', async () => {
    const response = await request('POST', '/api/a2a/tasks/define/batch', {
      tasks: [
        {
          taskId: 'batch-task-1-' + Date.now(),
          agentName: 'test-agent',
          taskType: 'test',
          prompt: '批量任务1'
        },
        {
          taskId: 'batch-task-2-' + Date.now(),
          agentName: 'test-agent',
          taskType: 'test',
          prompt: '批量任务2'
        }
      ]
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`HTTP ${response.status}`);
    }
  });

  test('GET /api/a2a/tasks/:taskId 应该获取任务定义', async () => {
    const taskId = 'task-get-test-' + Date.now();

    // 先创建
    await request('POST', '/api/a2a/tasks/define', {
      taskId,
      agentName: 'test-agent',
      taskType: 'test',
      prompt: '测试获取'
    });

    // 再获取
    const response = await request('GET', `/api/a2a/tasks/${taskId}`);

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
  });
});

describe('A2A API - 统计信息', () => {
  test('GET /api/a2a/collaboration/stats 应该返回统计信息', async () => {
    const response = await request('GET', '/api/a2a/collaboration/stats');

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
  });
});

// 运行测试
async function runTests() {
  console.log('='.repeat(50));
  console.log('A2A API 集成测试');
  console.log('='.repeat(50));

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n测试完成!');
  console.log('通过: ' + passed + ', 失败: ' + failed);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('测试执行失败:', e.message);
  process.exit(1);
});
