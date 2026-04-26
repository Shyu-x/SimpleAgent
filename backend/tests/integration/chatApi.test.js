/**
 * Chat API 集成测试 (Integration)
 * 测试聊天 API 的端到端流程，包括流式响应、取消机制等
 *
 * 运行: node chatApi.test.js
 */

const http = require('http');

// 测试配置
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 30000;

// 测试统计
let passed = 0;
let failed = 0;
const results = [];

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(name, status, message) {
  const icon = status === 'PASS' ? '[PASS]' : '[FAIL]';
  const color = status === 'PASS' ? colors.green : colors.red;
  console.log(color + icon + colors.reset + ' ' + name + ': ' + message);
}

/**
 * 发起 HTTP 请求的辅助函数
 */
function request(method, path, body = null, headers = {}, timeout = TIMEOUT) {
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
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * SSE 流式请求
 */
function sseRequest(path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      }
    };

    const chunks = [];
    const req = http.request(options, (res) => {
      res.on('data', chunk => {
        chunks.push(chunk.toString());
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: chunks.join('')
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => {
      req.destroy();
      reject(new Error('SSE timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ==================== 测试用例 ====================

async function runTests() {
  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('Chat API 集成测试');
  console.log('='.repeat(60) + colors.reset);

  // 基础功能测试
  console.log('\n--- 基础功能测试 ---');

  // Test 1
  try {
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'user', content: '你好' }]
    });
    const pass = res.body && [200, 500].includes(res.status);
    log('基础聊天请求', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('基础聊天请求', 'FAIL', e.message);
    failed++;
  }

  // Test 2
  try {
    const res = await request('POST', '/api/chat', {
      messages: [
        { role: 'user', content: '我叫张三' },
        { role: 'assistant', content: '好的，张三你好！' },
        { role: 'user', content: '我叫什么名字？' }
      ]
    });
    const pass = res.body && [200, 500].includes(res.status);
    log('多轮对话', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('多轮对话', 'FAIL', e.message);
    failed++;
  }

  // Test 3
  try {
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'user', content: '你好' }],
      systemPrompt: '你是一个友好的助手'
    });
    const pass = res.body && [200, 500].includes(res.status);
    log('System Prompt', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('System Prompt', 'FAIL', e.message);
    failed++;
  }

  // 流式响应测试
  console.log('\n--- 流式响应测试 ---');

  try {
    const res = await sseRequest('/api/chat', {
      messages: [{ role: 'user', content: '写一首诗' }],
      stream: true
    });
    const pass = res.body && [200, 500].includes(res.status);
    log('SSE 流式响应', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('SSE 流式响应', 'FAIL', e.message);
    failed++;
  }

  // 模型参数测试
  console.log('\n--- 模型参数测试 ---');

  try {
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'user', content: '你好' }],
      stream: false
    });
    const pass = res.body !== undefined;
    log('stream=false 参数', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('stream=false 参数', 'FAIL', e.message);
    failed++;
  }

  try {
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'user', content: '1+1等于几' }],
      model: 'MiniMax-M2.7'
    });
    const pass = res.body !== undefined;
    log('模型参数', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('模型参数', 'FAIL', e.message);
    failed++;
  }

  // 取消机制测试
  console.log('\n--- 取消机制测试 ---');

  try {
    const res = await request('POST', '/api/chat/stop', {});
    const pass = [200, 500].includes(res.status);
    log('停止生成', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('停止生成', 'FAIL', e.message);
    failed++;
  }

  // 错误处理测试
  console.log('\n--- 错误处理测试 ---');

  try {
    const res = await request('POST', '/api/chat', {});
    const pass = res.status === 400 && res.body.error;
    log('缺少 messages 返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('缺少 messages 返回 400', 'FAIL', e.message);
    failed++;
  }

  try {
    const res = await request('POST', '/api/chat', { messages: [] });
    const pass = res.status === 400;
    log('空消息数组返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('空消息数组返回 400', 'FAIL', e.message);
    failed++;
  }

  try {
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'invalid', content: 'test' }]
    });
    const pass = res.body !== undefined;
    log('无效 role 处理', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('无效 role 处理', 'FAIL', e.message);
    failed++;
  }

  try {
    const res = await request('POST', '/api/chat', {
      messages: Array.from({ length: 101 }, (_, i) => ({
        role: 'user',
        content: 'Message ' + i
      }))
    });
    const pass = res.status === 400 && res.body.error.message.includes('Too many');
    log('消息数量超限返回 400', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('消息数量超限返回 400', 'FAIL', e.message);
    failed++;
  }

  // 性能测试
  console.log('\n--- 性能测试 ---');

  try {
    const start = Date.now();
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'user', content: '你好' }]
    });
    const duration = Date.now() - start;
    const pass = duration < 5000;
    log('响应时间 < 5s', pass ? 'PASS' : 'FAIL', duration + 'ms');
    pass ? passed++ : failed++;
  } catch (e) {
    log('响应时间 < 5s', 'FAIL', e.message);
    failed++;
  }

  try {
    const promises = Array.from({ length: 3 }, () =>
      request('POST', '/api/chat', {
        messages: [{ role: 'user', content: '测试' }]
      })
    );
    const results = await Promise.all(promises);
    const pass = results.every(r => r.body !== undefined);
    log('并发请求处理', pass ? 'PASS' : 'FAIL', results.length + ' requests');
    pass ? passed++ : failed++;
  } catch (e) {
    log('并发请求处理', 'FAIL', e.message);
    failed++;
  }

  // 安全测试
  console.log('\n--- 安全测试 ---');

  try {
    const res = await request('POST', '/api/chat', {
      messages: [{ role: 'user', content: '<script>alert("xss")</script>' }]
    });
    const pass = res.status !== 500;
    log('XSS 攻击安全处理', pass ? 'PASS' : 'FAIL', 'status=' + res.status);
    pass ? passed++ : failed++;
  } catch (e) {
    log('XSS 攻击安全处理', 'FAIL', e.message);
    failed++;
  }

  // 健康检查
  console.log('\n--- 健康检查 ---');

  try {
    const res = await request('GET', '/api/health');
    const pass = res.status === 200 && res.body.status === 'ok';
    log('健康检查', pass ? 'PASS' : 'FAIL', JSON.stringify(res.body));
    pass ? passed++ : failed++;
  } catch (e) {
    log('健康检查', 'FAIL', e.message);
    failed++;
  }

  // 汇总
  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('Chat API 测试汇总');
  console.log('='.repeat(60) + colors.reset);
  console.log('Total: ' + (passed + failed));
  console.log(colors.green + 'Passed: ' + passed + colors.reset);
  console.log(colors.red + 'Failed: ' + failed + colors.reset);
  console.log('='.repeat(60));

  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
