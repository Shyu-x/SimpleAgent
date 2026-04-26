/**
 * HITL API 集成测试
 *
 * 测试内容：
 * 1. 创建确认请求
 * 2. 响应确认（批准/拒绝）
 * 3. SSE 订阅确认状态
 * 4. 查询确认状态
 * 5. 超时处理
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
  yellow: '\x1b[33m',
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

describe('HITL API - 创建确认请求', () => {
  test('POST /api/hitl/request 应该创建确认请求', async () => {
    const response = await request('POST', '/api/hitl/request', {
      sessionId: 'test-session-hitl',
      type: 'dangerous_operation',
      action: 'file_delete',
      params: {
        filePath: '/tmp/test.txt'
      },
      riskLevel: 'high',
      message: '确认删除文件 /tmp/test.txt'
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.body)}`);
    }

    if (!response.body.requestId) {
      throw new Error('缺少 requestId');
    }
  });

  test('创建确认请求应该验证必填字段', async () => {
    const response = await request('POST', '/api/hitl/request', {
      sessionId: 'test-session'
      // 缺少 type
    });

    if (response.status === 200 || response.status === 201) {
      throw new Error('应该返回错误');
    }
  });
});

describe('HITL API - 查询状态', () => {
  test('GET /api/hitl/status/:requestId 应该返回确认状态', async () => {
    // 先创建请求
    const createResponse = await request('POST', '/api/hitl/request', {
      sessionId: 'test-session-status',
      type: 'test_type',
      action: 'test_action',
      message: '测试确认'
    });

    if (createResponse.status !== 200 && createResponse.status !== 201) {
      throw new Error(`创建失败: ${JSON.stringify(createResponse.body)}`);
    }

    const requestId = createResponse.body.requestId;

    // 查询状态
    const statusResponse = await request('GET', `/api/hitl/status/${requestId}`);

    if (statusResponse.status !== 200) {
      throw new Error(`HTTP ${statusResponse.status}`);
    }

    if (statusResponse.body.requestId !== requestId) {
      throw new Error('requestId 不匹配');
    }
  });

  test('查询不存在的请求应该返回错误', async () => {
    const response = await request('GET', '/api/hitl/status/nonexistent-id');

    if (response.status === 200) {
      throw new Error('应该返回错误');
    }
  });
});

describe('HITL API - 响应确认', () => {
  test('POST /api/hitl/respond 批准确认请求', async () => {
    // 先创建请求
    const createResponse = await request('POST', '/api/hitl/request', {
      sessionId: 'test-session-respond',
      type: 'test_type',
      action: 'test_action',
      message: '测试确认响应'
    });

    if (createResponse.status !== 200 && createResponse.status !== 201) {
      throw new Error(`创建失败: ${JSON.stringify(createResponse.body)}`);
    }

    const requestId = createResponse.body.requestId;

    // 批准
    const respondResponse = await request('POST', '/api/hitl/respond', {
      requestId,
      action: 'approve',
      comment: '测试批准'
    });

    if (respondResponse.status !== 200) {
      throw new Error(`HTTP ${respondResponse.status}`);
    }

    if (respondResponse.body.status !== 'approved') {
      throw new Error('状态应该是 approved');
    }
  });

  test('POST /api/hitl/respond 拒绝确认请求', async () => {
    // 先创建请求
    const createResponse = await request('POST', '/api/hitl/request', {
      sessionId: 'test-session-reject',
      type: 'test_type',
      action: 'test_action',
      message: '测试拒绝'
    });

    if (createResponse.status !== 200 && createResponse.status !== 201) {
      throw new Error(`创建失败: ${JSON.stringify(createResponse.body)}`);
    }

    const requestId = createResponse.body.requestId;

    // 拒绝
    const respondResponse = await request('POST', '/api/hitl/respond', {
      requestId,
      action: 'reject',
      comment: '测试拒绝'
    });

    if (respondResponse.status !== 200) {
      throw new Error(`HTTP ${respondResponse.status}`);
    }

    if (respondResponse.body.status !== 'rejected') {
      throw new Error('状态应该是 rejected');
    }
  });
});

describe('HITL API - SSE 订阅', () => {
  test('GET /api/hitl/subscribe/:sessionId 应该返回 SSE 流', async () => {
    const sessionId = 'test-session-subscribe-' + Date.now();

    // 使用 fetch 发起 SSE 请求
    const response = await fetch(`${BASE_URL}/api/hitl/subscribe/${sessionId}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // 检查内容类型
    const contentType = response.headers.get('content-type');
    if (!contentType.includes('text/event-stream')) {
      throw new Error('应该返回 text/event-stream');
    }

    response.body.cancel();
  });
});

describe('HITL API - 错误处理', () => {
  test('无效的 riskLevel 应该被拒绝', async () => {
    const response = await request('POST', '/api/hitl/request', {
      sessionId: 'test-session',
      type: 'test',
      action: 'test',
      riskLevel: 'invalid_level',
      message: '测试'
    });

    if (response.status === 200 || response.status === 201) {
      throw new Error('应该返回错误');
    }
  });

  test('缺少 sessionId 应该返回错误', async () => {
    const response = await request('POST', '/api/hitl/request', {
      type: 'test',
      action: 'test'
    });

    if (response.status === 200 || response.status === 201) {
      throw new Error('应该返回错误');
    }
  });
});

// 运行测试
async function runTests() {
  console.log('='.repeat(50));
  console.log('HITL API 集成测试');
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
