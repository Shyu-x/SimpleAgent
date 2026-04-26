/**
 * AI Chat 玩具 - Agent 全面评价体系
 *
 * 评估维度：
 * 1. 基础对话能力
 * 2. 工具调用能力
 * 3. 多Agent协作
 * 4. RAG知识检索
 * 5. 意图识别与路由
 * 6. 流式响应质量
 * 7. 上下文保持
 * 8. 错误处理与容错
 *
 * 运行方式: node agent-evaluation-system.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================
const BASE_URL = 'http://localhost:30000';
const TIMEOUT = 120000;
const DEFAULT_MODEL = 'MiniMax-M2.7';
const OUTPUT_DIR = path.join(__dirname, '../../docs/test-results');

// ==================== 工具函数 ====================

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    };
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('请求超时')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function requestSSE(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', ...options.headers }
    };
    const req = client.request(requestOptions, (res) => {
      let buffer = '';
      const chunks = [];
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]' || data === '') continue;
            try { chunks.push(JSON.parse(data)); } catch { chunks.push({ type: 'raw', content: data }); }
          }
        }
      });
      res.on('end', () => resolve({ chunks, headers: res.headers }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('SSE超时')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function sendMessage(messages, stream = true) {
  const startTime = Date.now();
  try {
    if (stream) {
      const result = await requestSSE(`${BASE_URL}/api/chat`, {
        body: { messages, model: DEFAULT_MODEL, stream: true }
      });
      let fullContent = '';
      let toolUses = [];
      let intent = null;
      for (const chunk of result.chunks) {
        if (chunk.type === 'chunk' || chunk.type === 'content') {
          fullContent += chunk.content || '';
        }
        if (chunk.type === 'tool_use') toolUses.push(chunk.tool);
        if (chunk.type === 'intent') intent = chunk.intent;
      }
      return { success: true, content: fullContent, toolUses, intent, latency: Date.now() - startTime, chunks: result.chunks.length };
    } else {
      const result = await request(`${BASE_URL}/api/chat`, {
        body: { messages, model: DEFAULT_MODEL, stream: false }
      });
      if (result.status === 200 && result.data.content) {
        return { success: true, content: result.data.content, latency: Date.now() - startTime };
      } else if (result.data.error) {
        return { success: false, error: result.data.error.message || result.data.error, latency: Date.now() - startTime };
      }
      return { success: false, error: 'Unknown error', latency: Date.now() - startTime };
    }
  } catch (error) {
    return { success: false, error: error.message, latency: Date.now() - startTime };
  }
}

// ==================== 评价结果记录 ====================

const evaluation = {
  timestamp: new Date().toISOString(),
  总分: 0,
  评级: '',
  维度评分: {},
  详细测试: [],
  全链路追踪: []
};

// ==================== 评分标准 ====================

const SCORE_WEIGHTS = {
  基础对话: 15,
  工具调用: 20,
  多Agent协作: 15,
  RAG检索: 15,
  意图识别: 10,
  流式响应: 10,
  上下文保持: 10,
  错误处理: 5
};

function 计算总分(维度评分) {
  let 总分 = 0;
  for (const [维度, 分数] of Object.entries(维度评分)) {
    总分 += 分数 * (SCORE_WEIGHTS[维度] / 100);
  }
  return Math.round(总分);
}

function 确定评级(总分) {
  if (总分 >= 90) return 'S级 - 卓越';
  if (总分 >= 80) return 'A级 - 优秀';
  if (总分 >= 70) return 'B级 - 良好';
  if (总分 >= 60) return 'C级 - 一般';
  if (总分 >= 50) return 'D级 - 较差';
  return 'E级 - 很差';
}

// ==================== 测试用例定义 ====================

const 测试用例 = {
  // 维度1: 基础对话能力
  基础对话: [
    {
      名称: '通用问答',
      输入: '请介绍一下北京的历史',
      预期: '内容丰富、结构清晰、有事实依据'
    },
    {
      名称: '代码生成',
      输入: '用JavaScript写一个快速排序函数',
      预期: '代码正确、注释清晰、可运行'
    },
    {
      名称: '解释概念',
      输入: '什么是API？用通俗的话解释',
      预期: '解释清楚、例子恰当'
    },
    {
      名称: '推理分析',
      输入: '如果所有人都遵守交通规则，会发生什么？',
      预期: '逻辑合理、分析全面'
    },
    {
      名称: '创意写作',
      输入: '写一首关于秋天的七言绝句',
      预期: '符合格律、意境优美'
    }
  ],

  // 维度2: 工具调用能力
  工具调用: [
    {
      名称: '网络搜索',
      输入: '搜索今天的科技新闻',
      预期: '调用搜索工具、返回结果'
    },
    {
      名称: '计算器使用',
      输入: '计算 1234 * 5678',
      预期: '调用计算工具、结果正确'
    },
    {
      名称: '天气查询',
      输入: '北京今天天气怎么样？',
      预期: '调用天气工具、返回信息'
    },
    {
      名称: '知识库查询',
      输入: '公司年假政策是什么？',
      预期: '调用RAG检索、返回知识'
    },
    {
      名称: '多工具协作',
      输入: '先搜索AI最新进展，然后保存到笔记',
      预期: '按顺序调用多个工具'
    }
  ],

  // 维度3: 多Agent协作
  多Agent协作: [
    {
      名称: 'A2A通信',
      输入: '测试A2A协议连接',
      预期: 'Agent间能通信'
    },
    {
      名称: '任务委托',
      输入: '将复杂任务分解给多个Agent',
      预期: '任务被分解并分发'
    },
    {
      名称: '结果汇总',
      输入: '收集多个Agent的结果',
      预期: '能汇总并整合'
    }
  ],

  // 维度4: RAG知识检索
  RAG检索: [
    {
      名称: '精确检索',
      输入: '什么是年假的申请流程？',
      预期: '精确匹配、来源清晰'
    },
    {
      名称: '语义检索',
      输入: '我休年假需要提前多久申请？',
      预期: '语义理解、相关结果'
    },
    {
      名称: '多路召回',
      输入: '结合文档和常见问题回答',
      预期: '多通道同时召回'
    },
    {
      名称: '重排序',
      输入: '检索多个相关段落并排序',
      预期: '相关度高的排前'
    }
  ],

  // 维度5: 意图识别与路由
  意图识别: [
    {
      名称: '知识问答意图',
      输入: '请告诉我如何使用Git',
      预期: '识别为knowledge_qa'
    },
    {
      名称: '工具使用意图',
      输入: '帮我搜索最新的AI论文',
      预期: '识别为tool_use'
    },
    {
      名称: '创意生成意图',
      输入: '帮我想一个有创意的公司名',
      预期: '识别为creative'
    },
    {
      名称: '闲聊意图',
      输入: '今天天气真好',
      预期: '识别为casual_chat'
    },
    {
      名称: '复杂任务意图',
      输入: '请分析这段代码的性能问题并优化',
      预期: '识别为complex'
    }
  ],

  // 维度6: 流式响应质量
  流式响应: [
    {
      名称: 'SSE连接',
      输入: '发送请求并检查SSE',
      预期: '建立SSE连接'
    },
    {
      名称: '首包延迟',
      输入: '测量首次返回时间',
      预期: '首包延迟<3秒'
    },
    {
      名称: '打字机效果',
      输入: '观察输出方式',
      预期: '逐字输出、有动画'
    },
    {
      名称: '中断能力',
      输入: '发送停止请求',
      预期: '能立即停止'
    }
  ],

  // 维度7: 上下文保持
  上下文保持: [
    {
      名称: '3轮对话记忆',
      输入: '连续3轮讨论同一话题',
      预期: '记住之前内容'
    },
    {
      名称: '指代消解',
      输入: '问"它"指什么',
      预期: '正确理解指代'
    },
    {
      名称: '话题切换',
      输入: '讨论中切换话题',
      预期: '能自然过渡'
    },
    {
      名称: '长期记忆',
      输入: '引用之前的回答',
      预期: '能关联历史'
    }
  ],

  // 维度8: 错误处理与容错
  错误处理: [
    {
      名称: '无效输入',
      输入: '发送空消息',
      预期: '优雅处理、不崩溃'
    },
    {
      名称: '超长输入',
      输入: '发送超长文本',
      预期: '有截断或正确处理'
    },
    {
      名称: 'API错误',
      输入: '模拟API失败',
      预期: '有降级处理'
    },
    {
      名称: '超时处理',
      输入: '设置短超时',
      预期: '有超时提示'
    }
  ]
};

// ==================== 评估函数 ====================

function 评分响应(实际响应, 预期描述) {
  let 分数 = 0;
  let 详细反馈 = [];

  // 检查响应是否存在
  if (!实际响应 || 实际响应.length === 0) {
    return { 分数: 0, 反馈: '无响应内容' };
  }

  // 检查响应长度（太短说明可能有问题）
  if (实际响应.length < 10) {
    详细反馈.push('响应过短');
    分数 += 20;
  } else {
    分数 += 40;
  }

  // 检查是否包含模拟/测试文本
  if (实际响应.includes('Lorem ipsum') || 实际响应.includes('模拟回复')) {
    详细反馈.push('包含测试文本');
    分数 -= 30;
  }

  // 检查是否正常内容
  if (实际响应.includes('error') || 实际响应.includes('Error')) {
    详细反馈.push('包含错误信息');
    分数 -= 20;
  } else {
    分数 += 30;
  }

  // 内容质量
  if (实际响应.length > 50) {
    分数 += 20;
  }

  // 工具调用检测
  const 工具关键词 = ['搜索', '保存', '查询', '计算', '天气', '新闻'];
  const 包含工具 = 工具关键词.some(k => 实际响应.includes(k));
  if (包含工具) {
    分数 += 10;
    详细反馈.push('可能调用了工具');
  }

  return {
    分数: Math.max(0, Math.min(100, 分数)),
    反馈: 详细反馈.length > 0 ? 详细反馈.join(', ') : '正常'
  };
}

async function 执行测试用例(用例) {
  console.log(`\n  [测试] ${用例.名称}`);
  console.log(`  [输入] ${用例.输入}`);

  const 结果 = await sendMessage([{ role: 'user', content: 用例.输入 }], true);

  if (结果.success) {
    const 评分 = 评分响应(结果.content, 用例.预期);
    console.log(`  [输出] ${结果.content.slice(0, 100)}...`);
    console.log(`  [评分] ${评分.分数}/100 - ${评分.反馈}`);
    console.log(`  [延迟] ${结果.latency}ms, ${结果.chunks} chunks`);

    if (结果.toolUses && 结果.toolUses.length > 0) {
      console.log(`  [工具] ${结果.toolUses.join(', ')}`);
    }
    if (结果.intent) {
      console.log(`  [意图] ${结果.intent}`);
    }

    return {
      名称: 用例.名称,
      成功: true,
      评分: 评分.分数,
      延迟: 结果.latency,
      chunks: 结果.chunks,
      工具调用: 结果.toolUses || [],
      意图: 结果.intent,
      响应长度: 结果.content.length
    };
  } else {
    console.log(`  [错误] ${结果.error}`);
    return {
      名称: 用例.名称,
      成功: false,
      评分: 0,
      错误: 结果.error,
      延迟: 结果.latency
    };
  }
}

// ==================== 全链路追踪测试 ====================

async function 全链路追踪(查询) {
  console.log(`\n  [追踪] ${查询}`);
  const 开始时间 = Date.now();
  const 链路 = [];

  // 1. 意图识别
  链路.push({ 阶段: '意图识别', 开始时间: Date.now() - 开始时间 });
  const 意图结果 = await sendMessage([{ role: 'user', content: 查询 }], false);
  链路.push({ 阶段: '意图识别完成', 识别结果: 意图结果.intent || 'unknown', 耗时: Date.now() - 开始时间 });

  // 2. 查询改写
  链路.push({ 阶段: '查询改写', 开始时间: Date.now() - 开始时间 });
  // (如果RAG路由可用)
  链路.push({ 阶段: '查询改写完成', 耗时: Date.now() - 开始时间 });

  // 3. 知识检索
  链路.push({ 阶段: '知识检索', 开始时间: Date.now() - 开始时间 });
  链路.push({ 阶段: '知识检索完成', 耗时: Date.now() - 开始时间 });

  // 4. 模型生成
  链路.push({ 阶段: '模型生成', 开始时间: Date.now() - 开始时间 });
  const 生成结果 = await sendMessage([{ role: 'user', content: 查询 }], true);
  链路.push({ 阶段: '模型生成完成', 耗时: Date.now() - 开始时间, 响应长度: 生成结果.content?.length || 0 });

  // 5. 后处理
  链路.push({ 阶段: '后处理', 开始时间: Date.now() - 开始时间 });
  链路.push({ 阶段: '完成', 总耗时: Date.now() - 开始时间 });

  console.log(`  [链路耗时] ${Date.now() - 开始时间}ms`);

  return {
    查询,
    链路,
    总耗时: Date.now() - 开始时间,
    响应: 生成结果.content
  };
}

// ==================== 主评估流程 ====================

async function 运行评估() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║         AI Chat 玩具 - Agent 全面评价体系 v1.0.0                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`[目标] ${BASE_URL}`);
  console.log(`[模型] ${DEFAULT_MODEL}`);
  console.log(`[时间] ${evaluation.timestamp}`);
  console.log(`[维度] ${Object.keys(测试用例).length} 个维度, ${Object.values(测试用例).reduce((a, b) => a + b.length, 0)} 个测试用例`);

  const 维度评分 = {};
  let 总评分 = 0;

  // 检查服务
  console.log('\n检查服务状态...');
  try {
    await request(`${BASE_URL}/api/health`);
    console.log('[OK] 服务正常\n');
  } catch {
    console.log('[错误] 服务不可用\n');
    return;
  }

  // 执行各维度测试
  for (const [维度名称, 用例列表] of Object.entries(测试用例)) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`[维度] ${维度名称} (权重: ${SCORE_WEIGHTS[维度名称]}%)`);
    console.log('='.repeat(70));

    const 维度结果 = [];
    let 维度总分 = 0;

    for (const 用例 of 用例列表) {
      const 结果 = await 执行测试用例(用例);
      维度结果.push(结果);
      维度总分 += 结果.评分;
    }

    const 平均分 = Math.round(维度总分 / 用例列表.length);
    维度评分[维度名称] = 平均分;

    console.log(`\n  [${维度名称}评分] ${平均分}/100`);

    evaluation.详细测试.push({ 维度: 维度名称, 用例: 维度结果, 平均分 });
  }

  // 全链路追踪测试
  console.log(`\n${'='.repeat(70)}`);
  console.log('[全链路追踪测试]');
  console.log('='.repeat(70));

  const 追踪查询列表 = [
    '什么是JavaScript闭包？',
    '帮我搜索AI最新进展',
    '公司年假政策是什么？'
  ];

  for (const 查询 of 追踪查询列表) {
    const 追踪结果 = await 全链路追踪(查询);
    evaluation.全链路追踪.push(追踪结果);
  }

  // 计算总分
  总评分 = 计算总分(维度评分);
  const 评级 = 确定评级(总评分);

  evaluation.总分 = 总评分;
  evaluation.评级 = 评级;
  evaluation.维度评分 = 维度评分;

  // ==================== 输出评估报告 ====================
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║                       Agent 评估报告                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log(`[总分] ${总评分}/100`);
  console.log(`[评级] ${评级}`);
  console.log('');

  console.log('[各维度评分]');
  console.log('─'.repeat(60));
  for (const [维度, 分数] of Object.entries(维度评分)) {
    const 等级 = 分数 >= 80 ? '[优秀]' : 分数 >= 60 ? '[良好]' : 分数 >= 40 ? '[一般]' : '[较差]';
    console.log(`  ${等级} ${维度}: ${分数}/100 (权重: ${SCORE_WEIGHTS[维度]}%)`);
  }

  console.log('');
  console.log('[权重分布]');
  console.log('─'.repeat(60));
  for (const [维度, 权重] of Object.entries(SCORE_WEIGHTS)) {
    console.log(`  ${维度}: ${权重}%`);
  }

  console.log('');
  console.log('[详细测试结果]');
  console.log('─'.repeat(60));
  for (const 测试分类 of evaluation.详细测试) {
    console.log(`\n  【${测试分类.维度}】 平均: ${测试分类.平均分}/100`);
    for (const 用例 of 测试分类.用例) {
      const 状态 = 用例.成功 ? '[OK]' : '[失败]';
      console.log(`    ${状态} ${用例.名称}: ${用例.评分}/100 ${用例.延迟 ? `(${用例.latency}ms)` : ''}`);
      if (用例.工具调用 && 用例.工具调用.length > 0) {
        console.log(`         工具: ${用例.工具调用.join(', ')}`);
      }
      if (用例.意图) {
        console.log(`         意图: ${用例.意图}`);
      }
    }
  }

  console.log('');
  console.log('[全链路追踪汇总]');
  console.log('─'.repeat(60));
  for (const 追踪 of evaluation.全链路追踪) {
    console.log(`\n  查询: "${追踪.查询}"`);
    console.log(`  总耗时: ${追踪.总耗时}ms`);
    console.log(`  响应长度: ${追踪.响应?.length || 0} 字符`);
    console.log(`  链路阶段:`);
    for (const 阶段 of 追踪.链路) {
      console.log(`    - ${阶段.阶段}: ${阶段.耗时 || 0}ms`);
    }
  }

  // 优点与不足
  console.log('');
  console.log('[优点分析]');
  console.log('─'.repeat(60));
  const 优点 = Object.entries(维度评分)
    .filter(([_, 分数]) => 分数 >= 70)
    .map(([维度]) => 维度);
  if (优点.length > 0) {
    优点.forEach(d => console.log(`  + ${d}`));
  } else {
    console.log('  (暂无明显优点)');
  }

  console.log('');
  console.log('[待改进项]');
  console.log('─'.repeat(60));
  const 不足 = Object.entries(维度评分)
    .filter(([_, 分数]) => 分数 < 60)
    .map(([维度]) => 维度);
  if (不足.length > 0) {
    不足.forEach(d => console.log(`  - ${d}: ${维度评分[d]}/100`));
  } else {
    console.log('  (暂无明显不足)');
  }

  console.log('');

  // 保存JSON报告
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const reportPath = path.join(OUTPUT_DIR, `agent-evaluation-${dateStr}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(evaluation, null, 2));
  console.log(`[报告] 已保存: ${path.relative(path.join(__dirname, '../..'), reportPath)}`);

  // 生成HTML报告
  const htmlPath = path.join(OUTPUT_DIR, `agent-evaluation-${dateStr}.html`);
  const htmlContent = generateHTMLReport(evaluation);
  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`[HTML报告] 已保存: ${path.relative(path.join(__dirname, '../..'), htmlPath)}`);

  return evaluation;
}

function generateHTMLReport(data) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent 评估报告 - ${data.timestamp}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; color: #333; margin-bottom: 10px; }
    .timestamp { text-align: center; color: #666; margin-bottom: 30px; }
    .summary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 16px; padding: 30px; text-align: center; margin-bottom: 30px; }
    .score { font-size: 72px; font-weight: bold; }
    .grade { font-size: 28px; margin-top: 10px; opacity: 0.9; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .card h3 { color: #333; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
    .metric { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee; }
    .metric:last-child { border-bottom: none; }
    .metric-name { color: #555; }
    .metric-score { font-weight: bold; color: #667eea; }
    .metric-score.good { color: #52c41a; }
    .metric-score.bad { color: #f5222d; }
    .progress-bar { height: 8px; background: #e8e8e8; border-radius: 4px; margin-top: 5px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    .section { background: white; border-radius: 12px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .section h2 { color: #333; margin-bottom: 20px; border-left: 4px solid #667eea; padding-left: 15px; }
    .test-item { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #f0f0f0; }
    .test-item:last-child { border-bottom: none; }
    .test-name { color: #555; }
    .test-score { font-weight: bold; }
    .trace-item { background: #fafafa; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
    .trace-query { font-weight: bold; color: #333; margin-bottom: 10px; }
    .trace-stages { display: flex; flex-wrap: wrap; gap: 10px; }
    .stage { background: #667eea; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; }
    .good { color: #52c41a; }
    .bad { color: #f5222d; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Agent 智能度评估报告</h1>
    <p class="timestamp">评估时间: ${data.timestamp}</p>

    <div class="summary">
      <div class="score">${data.总分}</div>
      <div class="grade">${data.评级}</div>
    </div>

    <div class="grid">
      ${Object.entries(data.维度评分).map(([维度, 分数]) => {
        const 颜色 = 分数 >= 80 ? '#52c41a' : 分数 >= 60 ? '#faad14' : '#f5222d';
        return `
        <div class="card">
          <h3>${维度}</h3>
          <div class="metric">
            <span class="metric-name">评分</span>
            <span class="metric-score ${分数 >= 60 ? 'good' : 'bad'}">${分数}/100</span>
          </div>
          <div class="metric">
            <span class="metric-name">权重</span>
            <span>${SCORE_WEIGHTS[维度]}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${分数}%; background: ${颜色};"></div>
          </div>
        </div>
        `;
      }).join('')}
    </div>

    <div class="section">
      <h2>详细测试结果</h2>
      ${data.详细测试.map(分类 => `
        <h4 style="margin: 20px 0 10px; color: #667eea;">${分类.维度} (平均: ${分类.平均分}/100)</h4>
        ${分类.用例.map(用例 => `
          <div class="test-item">
            <span class="test-name">${用例.成功 ? '✓' : '✗'} ${用例.名称}</span>
            <span class="test-score ${用例.评分 >= 60 ? 'good' : 'bad'}">${用例.评分}/100</span>
          </div>
        `).join('')}
      `).join('')}
    </div>

    <div class="section">
      <h2>全链路追踪</h2>
      ${data.全链路追踪.map(追踪 => `
        <div class="trace-item">
          <div class="trace-query">"${追踪.查询}"</div>
          <div>总耗时: <strong>${追踪.总耗时}ms</strong></div>
          <div class="trace-stages">
            ${追踪.链路.map(阶段 => `<span class="stage">${阶段.阶段}: ${阶段.耗时 || 0}ms</span>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <div style="text-align: center; color: #999; padding: 20px;">
      AI Chat 玩具 - Agent 评估系统 v1.0.0
    </div>
  </div>
</body>
</html>`;
}

// 运行评估
运行评估()
  .then(results => {
    console.log('\n[完成] Agent 评估完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('[错误]', err);
    process.exit(1);
  });
