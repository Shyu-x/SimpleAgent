/**
 * AI Chat 玩具 - 连续对话场景测试
 * 测试 Agent 智能程度，全链路监控并汇报详细问答内容
 *
 * 运行方式: node dialogue-scenario-test.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 90000; // 90秒超时
const DEFAULT_MODEL = 'MiniMax-M2.7'; // 使用标准旗舰版模型
const OUTPUT_DIR = path.join(__dirname, '../../docs/test-results');

// ==================== 工具函数 ====================

/**
 * SSE流式请求 - 实时处理
 */
function requestSSEStream(url, options = {}, onChunk) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'User-Agent': 'AI-Chat-Dialogue-Test/1.0',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();

        // 按行处理
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              onChunk(event, null);
            } catch {
              // 非JSON数据，可能是纯文本
              if (data) {
                onChunk({ type: 'text', content: data }, null);
              }
            }
          }
        }
      });

      res.on('end', () => {
        // 处理剩余buffer
        if (buffer.trim()) {
          if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6).trim();
            if (data !== '[DONE]') {
              try {
                const event = JSON.parse(data);
                onChunk(event, null);
              } catch {
                onChunk({ type: 'text', content: data }, null);
              }
            }
          }
        }
        resolve(null);
      });

      res.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * 发送聊天请求并获取完整响应
 */
async function sendChatMessage(messages, model = DEFAULT_MODEL) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let fullContent = '';
    let intent = null;
    let toolsUsed = [];
    let chunks = 0;

    const url = `${BASE_URL}/api/chat`;

    requestSSEStream(url, {
      method: 'POST',
      body: { messages, model, stream: true }
    }, (event, err) => {
      if (err) {
        reject(err);
        return;
      }

      if (event.type === 'chunk' || event.type === 'content') {
        fullContent += event.content || '';
        chunks++;
      } else if (event.type === 'intent') {
        intent = event.intent;
      } else if (event.type === 'tool_use') {
        toolsUsed.push(event.tool);
      }
    }).then(() => {
      resolve({
        success: true,
        response: fullContent,
        intent,
        toolsUsed,
        chunks,
        latency: Date.now() - startTime
      });
    }).catch(reject);
  });
}

// ==================== 测试结果记录 ====================

const testResults = {
  timestamp: new Date().toISOString(),
  scenarios: [],
  总场景数: 0,
  总对话轮次: 0,
  总Token数: 0
};

/**
 * 添加对话场景结果
 */
function addScenario(scenario) {
  testResults.scenarios.push(scenario);
  testResults.总场景数++;
  testResults.总对话轮次 += scenario.turns.length;
  testResults.总Token数 += scenario.totalTokens;
}

// ==================== 对话场景定义 ====================

const dialogueScenarios = [
  {
    name: '技术问答 - 渐进式深入',
    description: '连续3轮技术问答，后续问题承接前文上下文',
    turns: [
      {
        message: '什么是JavaScript的闭包？请用简单的话解释。',
        expectedIntent: 'knowledge_qa'
      },
      {
        message: '那它和普通函数有什么区别？',
        expectedIntent: 'knowledge_qa',
        承接概念: '闭包'
      },
      {
        message: '能给我一个实际的开发场景例子吗？',
        expectedIntent: 'knowledge_qa',
        承接概念: '闭包'
      }
    ]
  },
  {
    name: '代码调试 - 错误定位',
    description: '提供一个有问题的代码，Agent需要分析并给出解决方案',
    turns: [
      {
        message: '这段代码报错：TypeError: Cannot read property "map" of undefined',
        expectedIntent: 'tool_use'
      },
      {
        message: '这是出错的部分：const data = fetchData(); data.map(x => x.id)',
        expectedIntent: 'knowledge_qa'
      },
      {
        message: '怎么修改才能避免这个错误？',
        expectedIntent: 'tool_use'
      }
    ]
  },
  {
    name: '多步骤任务执行',
    description: '需要多个工具协作完成的复杂任务',
    turns: [
      {
        message: '帮我搜索今天的科技新闻，然后用中文总结要点。',
        expectedIntent: 'tool_use'
      },
      {
        message: '把刚才的新闻保存到我的笔记里，标签是"科技"',
        expectedIntent: 'tool_use'
      },
      {
        message: '列出我所有标签为"科技"的笔记',
        expectedIntent: 'tool_use'
      }
    ]
  },
  {
    name: '知识库检索 - RAG应用',
    description: '测试RAG知识库检索与生成',
    turns: [
      {
        message: '请问公司关于年假的政策是什么？',
        expectedIntent: 'knowledge_qa'
      },
      {
        message: '那我探亲假有多少天？',
        expectedIntent: 'knowledge_qa',
        承接概念: '假期政策'
      },
      {
        message: '申请流程是怎样的？',
        expectedIntent: 'knowledge_qa',
        承接概念: '请假流程'
      }
    ]
  },
  {
    name: '创意生成 - 思维发散',
    description: '测试Agent创意能力与上下文保持',
    turns: [
      {
        message: '帮我想3个APP产品名称，要求简洁、有趣、容易记住',
        expectedIntent: 'creative'
      },
      {
        message: '第一个名字的logo用什么颜色比较好？',
        expectedIntent: 'creative',
        承接概念: '第一个名字'
      },
      {
        message: '用这个颜色设计一个简单的logo描述',
        expectedIntent: 'creative',
        承接概念: 'logo设计'
      }
    ]
  }
];

// ==================== 运行单个场景 ====================

async function runScenario(scenario) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[场景] ${scenario.name}`);
  console.log(`[描述] ${scenario.description}`);
  console.log('='.repeat(70));

  const scenarioResult = {
    name: scenario.name,
    description: scenario.description,
    turns: [],
    totalTokens: 0,
    success: true,
    context: []
  };

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    console.log(`\n--- 第 ${i + 1} 轮对话 ---`);
    console.log(`[用户] ${turn.message}`);

    if (turn.expectedIntent) {
      console.log(`[预期意图] ${turn.expectedIntent}`);
    }
    if (turn.承接概念) {
      console.log(`[承接概念] ${turn.承接概念}`);
    }

    try {
      const result = await sendChatMessage(
        [
          ...scenarioResult.context.map(c => ({
            role: c.role,
            content: c.content
          })),
          {
            role: 'user',
            content: turn.message
          }
        ]
      );

      console.log(`\n[Agent] 回复 (${result.latency}ms, ${result.chunks} chunks):`);
      console.log('─'.repeat(50));

      const displayContent = result.response.length > 300
        ? result.response.slice(0, 300) + '...'
        : result.response;
      console.log(displayContent);

      if (result.toolsUsed && result.toolsUsed.length > 0) {
        console.log(`\n[使用工具] ${result.toolsUsed.join(', ')}`);
      }

      if (result.intent) {
        console.log(`[识别意图] ${result.intent}`);
      }

      // Token估算
      const chineseChars = (result.response.match(/[\u4e00-\u9fff]/g) || []).length;
      const otherChars = result.response.length - chineseChars;
      const estimatedTokens = Math.ceil(chineseChars / 2 + otherChars / 4);
      scenarioResult.totalTokens += estimatedTokens;

      console.log(`[Token估算] ${estimatedTokens}`);

      // 更新上下文
      scenarioResult.context.push(
        { role: 'user', content: turn.message },
        { role: 'assistant', content: result.response }
      );

      scenarioResult.turns.push({
        turnNumber: i + 1,
        userMessage: turn.message,
        assistantResponse: result.response,
        chunksCount: result.chunks,
        intent: result.intent,
        toolsUsed: result.toolsUsed,
        latency: result.latency,
        estimatedTokens
      });

    } catch (error) {
      console.log(`\n[错误] 请求失败: ${error.message}`);
      scenarioResult.success = false;
      scenarioResult.turns.push({
        turnNumber: i + 1,
        userMessage: turn.message,
        error: error.message
      });
    }
  }

  console.log(`\n[完成] 场景 "${scenario.name}" - ${scenarioResult.success ? '成功' : '失败'}`);
  return scenarioResult;
}

// ==================== 全链路监控测试 ====================

async function testFullPipeline() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[全链路监控测试]`);
  console.log('='.repeat(70));

  const testCases = [
    {
      name: '查询改写测试',
      query: '公司年假多少天'
    },
    {
      name: '问题拆分测试',
      query: '请告诉我关于年假和探亲假的全部规定，包括天数、申请条件和流程'
    },
    {
      name: '意图分类测试',
      query: '帮我搜索最新的人工智能新闻'
    }
  ];

  const results = [];

  for (const testCase of testCases) {
    console.log(`\n[测试] ${testCase.name}`);
    console.log(`   输入: "${testCase.query}"`);

    try {
      // 直接发送请求测试
      const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: testCase.query }],
          model: DEFAULT_MODEL,
          stream: false
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.content || data.response) {
          console.log(`   [成功] 响应正常 (${(data.content || data.response).length} 字符)`);
          results.push({ name: testCase.name, success: true });
        } else {
          console.log(`   [警告] 响应为空`);
          results.push({ name: testCase.name, success: false, error: 'Empty response' });
        }
      } else {
        const error = await res.text();
        console.log(`   [失败] 错误: ${res.status} - ${error.slice(0, 100)}`);
        results.push({ name: testCase.name, success: false, error: `${res.status}` });
      }
    } catch (error) {
      console.log(`   [异常] ${error.message}`);
      results.push({ name: testCase.name, success: false, error: error.message });
    }
  }

  return results;
}

// ==================== 主测试运行器 ====================

async function runAllTests() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        AI Chat 玩具 - 连续对话场景智能测试 v1.0.0                ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`[目标] ${BASE_URL}`);
  console.log(`[模型] ${DEFAULT_MODEL}`);
  console.log(`[时间] ${testResults.timestamp}`);

  const startTime = Date.now();

  // 检查服务状态
  console.log('\n检查服务状态...');
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      console.log('[OK] 服务已就绪\n');
    }
  } catch (error) {
    console.log('[错误] 服务未启动或无法连接');
    console.log('请先启动后端服务: cd backend && npm run dev\n');
    return;
  }

  // 1. 运行全链路监控测试
  console.log('\n【第一部分】全链路监控测试');
  const pipelineResults = await testFullPipeline();

  // 2. 运行连续对话场景测试
  console.log('\n\n【第二部分】连续对话场景测试');

  for (const scenario of dialogueScenarios) {
    const result = await runScenario(scenario);
    addScenario(result);
  }

  const duration = Date.now() - startTime;

  // ==================== 输出汇总报告 ====================
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                      测试汇总报告                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // 全链路测试结果
  console.log('[全链路监控]');
  console.log('─'.repeat(50));
  const pipelineSuccess = pipelineResults.filter(r => r.success).length;
  console.log(`  成功率: ${pipelineSuccess}/${pipelineResults.length} (${((pipelineSuccess / pipelineResults.length) * 100).toFixed(0)}%)`);
  pipelineResults.forEach(r => {
    const icon = r.success ? '[OK]' : '[失败]';
    console.log(`  ${icon} ${r.name}`);
    if (r.error) console.log(`     错误: ${r.error}`);
  });

  // 对话场景结果
  console.log('\n[连续对话场景]');
  console.log('─'.repeat(50));
  const scenarioSuccess = testResults.scenarios.filter(s => s.success).length;
  console.log(`  场景成功率: ${scenarioSuccess}/${testResults.总场景数}`);
  console.log(`  总对话轮次: ${testResults.总对话轮次}`);
  console.log(`  总Token数: ${testResults.总Token数}`);

  // 详细场景报告
  console.log('\n[场景详情]');
  console.log('─'.repeat(50));
  testResults.scenarios.forEach((s, i) => {
    const icon = s.success ? '[OK]' : '[失败]';
    console.log(`\n  ${i + 1}. ${icon} ${s.name}`);
    console.log(`     轮次: ${s.turns.length} | Token: ${s.totalTokens}`);
    s.turns.forEach((t, j) => {
      const responseLen = t.assistantResponse?.length || 0;
      const status = t.error ? `[错误] ${t.error}` : `[OK] ${t.latency}ms`;
      console.log(`     - 轮${j + 1}: ${status} | ${responseLen}字符 | 意图:${t.intent || 'N/A'}`);
    });
  });

  console.log(`\n总耗时: ${(duration / 1000).toFixed(2)}s`);
  console.log('');

  // 保存JSON报告
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const reportPath = path.join(OUTPUT_DIR, `dialogue-test-${dateStr}.json`);

  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`[报告] 已保存: ${path.relative(path.join(__dirname, '../..'), reportPath)}`);

  return testResults;
}

// 运行测试
runAllTests()
  .then(results => {
    const hasFailures = results.scenarios.some(s => !s.success);
    process.exit(hasFailures ? 1 : 0);
  })
  .catch(err => {
    console.error('[错误] 测试运行器异常:', err);
    process.exit(1);
  });
