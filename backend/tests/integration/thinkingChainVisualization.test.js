/**
 * MiniMax 思维链可视化测试
 * 验证思维链解析和可视化功能
 */

const http = require('http');
const { ThinkingChainParser, thinkingChainParser } = require('../../src/services/thinkingChainParser');

const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 120000;

let passed = 0;
let failed = 0;

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

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
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('请求超时')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// 收集 SSE 流式响应
function collectSSEStream(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let buffer = '';
      let rawContent = '';         // 原始响应（包含[THINK]标签）
      let thinkingContent = '';       // 思维链内容
      let responseContent = '';      // 最终回答
      let thinkingEvents = [];      // 思维链事件列表
      let thinkingCount = 0;

      res.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const event = JSON.parse(jsonStr);

              // 处理 thinking_delta 事件
              if (event.type === 'thinking_delta') {
                thinkingContent += event.content;
                thinkingCount++;
                thinkingEvents.push({
                  index: event.blockIndex,
                  content: event.content,
                  timestamp: Date.now()
                });
                rawContent += `<think>${event.content}[/THINK]`;
              }
              // 处理 thinking_complete 事件
              else if (event.type === 'thinking_complete') {
                console.log(`    思维链完成: ${event.thinkingCount} 个思考块`);
              }
              // 处理普通文本内容
              else if (event.choices && event.choices[0]?.delta?.content) {
                const text = event.choices[0].delta.content;
                responseContent += text;
                rawContent += text;
              }
            } catch (e) {}
          }
        }
      });

      res.on('end', () => {
        resolve({
          rawContent,
          thinkingContent,
          responseContent,
          thinkingEvents,
          thinkingCount
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('SSE 超时')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

async function testThinkingChainParser() {
  console.log('\n========================================');
  console.log('1. 思维链解析器单元测试');
  console.log('========================================\n');

  await runTest('解析器 - 基础解析', () => {
    const testContent = '<think>用户说"你好"[/THINK]你好！很高兴见到你。';
    const result = thinkingChainParser.parse(testContent);
    assertTrue(result.hasThinking, '应有思维链');
    assertTrue(result.thinking.length >= 1, '思维链数量应 >= 1');
    assertTrue(result.content.includes('你好'), '内容应包含回复');
  });

  await runTest('解析器 - 无思维链', () => {
    const testContent = '这是一个简单的回答。';
    const result = thinkingChainParser.parse(testContent);
    assertTrue(!result.hasThinking, '不应有思维链');
    assertTrue(result.content === testContent, '内容应保持不变');
  });

  await runTest('解析器 - 多个思维块', () => {
    const testContent = '<think>第一步思考[/THINK]<think>第二步思考[/THINK]最终回答';
    const result = thinkingChainParser.parse(testContent);
    assertTrue(result.hasThinking, '应有思维链');
    assertTrue(result.thinking.length === 2, '应有 2 个思维块');
  });

  await runTest('解析器 - Markdown 输出', () => {
    const testContent = '<think>思考内容[/THINK]最终回答';
    const md = thinkingChainParser.toMarkdown(testContent);
    assertTrue(md.includes('## 思维过程'), '应包含思维过程标题');
    assertTrue(md.includes('## 最终回答'), '应包含最终回答标题');
  });

  await runTest('解析器 - 可视化数据', () => {
    const testContent = '<think>思考内容[/THINK]最终回答';
    const viz = thinkingChainParser.generateVisualization(testContent);
    assertTrue(viz.hasThinking, '应有思维链');
    assertTrue(Array.isArray(viz.timeline), '应有时间线');
    assertTrue(viz.totalSteps > 0, '应有步骤');
  });
}

async function testThinkingChainAPI() {
  console.log('\n========================================');
  console.log('2. 思维链 API 流式测试');
  console.log('========================================\n');

  await runTest('API - 简单问候', async () => {
    const result = await collectSSEStream('/api/v1/chat/completions', {
      messages: [{ role: 'user', content: '你好' }],
      model: 'MiniMax-M2.7'
    });

    console.log(`    思维块数量: ${result.thinkingCount}`);
    console.log(`    思维链长度: ${result.thinkingContent.length} 字符`);
    console.log(`    回复长度: ${result.responseContent.length} 字符`);

    assertTrue(result.thinkingCount > 0, '应有思维块');
    assertTrue(result.thinkingContent.length > 0, '应有思维链内容');
    assertTrue(result.responseContent.length > 0, '应有回复内容');
  });

  await runTest('API - 代码生成', async () => {
    const result = await collectSSEStream('/api/v1/chat/completions', {
      messages: [{ role: 'user', content: '用 Python 写一个 Hello World' }],
      model: 'MiniMax-M2.7'
    });

    console.log(`    思维块数量: ${result.thinkingCount}`);
    console.log(`    回复长度: ${result.responseContent.length} 字符`);

    assertTrue(result.thinkingCount > 0, '应有思维块');
    // 代码中可能包含函数定义
    assertTrue(result.responseContent.length > 0, '应有回复');
  });

  await runTest('API - 复杂问题', async () => {
    const result = await collectSSEStream('/api/v1/chat/completions', {
      messages: [{ role: 'user', content: '解释什么是人工智能，以及它和机器学习的关系' }],
      model: 'MiniMax-M2.7'
    });

    console.log(`    思维块数量: ${result.thinkingCount}`);
    console.log(`    思维链长度: ${result.thinkingContent.length} 字符`);
    console.log(`    回复长度: ${result.responseContent.length} 字符`);

    assertTrue(result.thinkingCount > 0, '应有思维块');
    assertTrue(result.thinkingContent.length > 100, '思维链应有一定长度');
    assertTrue(result.responseContent.length > 100, '回复应有一定长度');
  });
}

async function visualizeThinkingChain() {
  console.log('\n========================================');
  console.log('3. 思维链可视化展示');
  console.log('========================================\n');

  const result = await collectSSEStream('/api/v1/chat/completions', {
    messages: [{ role: 'user', content: '什么是 Python 编程语言？' }],
    model: 'MiniMax-M2.7'
  });

  console.log('\n【思维链分析】');
  console.log(`总思维块数: ${result.thinkingCount}`);
  console.log(`思维链总长度: ${result.thinkingContent.length} 字符`);

  // 解析思维链
  const parsed = thinkingChainParser.parse(result.rawContent);

  console.log('\n【解析结果】');
  console.log(`是否有思维链: ${parsed.hasThinking}`);
  console.log(`思维链数量: ${parsed.thinking.length}`);
  console.log(`纯净回复: ${parsed.content.substring(0, 200)}...`);

  // 生成时间线
  const viz = thinkingChainParser.generateVisualization(result.rawContent);
  console.log('\n【时间线】');
  for (const step of viz.timeline) {
    const label = step.type === 'thinking' ? '🧠' : '💬';
    console.log(`  ${label} 步骤 ${step.step}: ${step.label}`);
    console.log(`     ${step.content.substring(0, 100)}...`);
  }

  // Markdown 格式
  console.log('\n【Markdown 格式】');
  const md = thinkingChainParser.toMarkdown(result.rawContent);
  console.log(md.substring(0, 800) + '...');
}

async function runAllTests() {
  console.log('================================================');
  console.log('MiniMax 思维链可视化测试');
  console.log('================================================');

  const startTime = Date.now();

  await testThinkingChainParser();
  await testThinkingChainAPI();
  await visualizeThinkingChain();

  const duration = Date.now() - startTime;
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log(`耗时: ${duration}ms`);
  console.log('========================================\n');
}

runAllTests()
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
