/**
 * Token Manager 测试脚本
 * 验证 tiktoken 专业 Token 计数功能
 */

const { createTokenManager } = require('../src/services/agent/TokenManager');

async function runTests() {
  console.log('='.repeat(60));
  console.log('🔧 Token Manager 专业测试');
  console.log('='.repeat(60));

  // 创建 Token Manager
  const tokenManager = createTokenManager({ model: 'minimax' });

  console.log('\n📊 Token 管理器信息:');
  console.log(`   模型: ${tokenManager.model}`);
  console.log(`   编码: ${tokenManager.getEncodingInfo().name}`);

  // 测试 1: 基本 Token 计数
  console.log('\n🧪 测试 1: 基本 Token 计数');
  const testCases = [
    { text: '你好', desc: '中文' },
    { text: 'Hello world', desc: '英文' },
    { text: '你好 Hello 123', desc: '混合' },
    { text: '这是一段很长的中文文本，用于测试Token计数功能是否准确。' +
           '我们需要确保无论是中文还是英文，都能得到准确的Token数量。' +
           '这对于上下文压缩和对话管理非常重要。', desc: '长中文' },
    {
      text: 'This is a long English text for testing token counting accuracy. ' +
            'We need to ensure that both Chinese and English can get accurate token counts. ' +
            'This is very important for context compression and conversation management. ' +
            'The tokenizer should handle various languages correctly.',
      desc: '长英文'
    }
  ];

  for (const { text, desc } of testCases) {
    const tokens = tokenManager.count(text);
    console.log(`   ${desc}: ${text.length} 字符 -> ${tokens} tokens`);
  }

  // 测试 2: 消息 Token 计数
  console.log('\n🧪 测试 2: 消息列表 Token 计数');
  const messages = [
    { role: 'system', content: '你是一个有帮助的AI助手。' },
    { role: 'user', content: '请介绍一下自己。' },
    { role: 'assistant', content: '我是一个人工智能助手，可以帮助你完成各种任务。' },
    { role: 'user', content: '你能做什么？' },
    { role: 'assistant', content: '我可以帮你回答问题、写代码、分析数据、翻译文本等等。' }
  ];

  const messageTokens = tokenManager.countMessages(messages);
  console.log(`   5条消息: ${messageTokens} tokens`);

  // 测试 3: 压缩功能
  console.log('\n🧪 测试 3: 智能压缩');
  const longMessages = [];
  for (let i = 0; i < 10; i++) {
    longMessages.push({
      role: 'user',
      content: `这是第 ${i + 1} 条用户消息，内容是关于某个技术话题的讨论。` +
               `我们正在测试长对话的压缩效果。` +
               `这个系统需要能够智能地管理对话历史。`
    });
    longMessages.push({
      role: 'assistant',
      content: `这是第 ${i + 1} 条助手回复，内容是回答用户的问题。` +
               `我们正在测试长对话的压缩效果。` +
               `系统需要保留重要的上下文信息。` +
               `同时压缩不重要的细节。`
    });
  }

  const longTokens = tokenManager.countMessages(longMessages);
  console.log(`   原始消息: ${longMessages.length} 条, ${longTokens} tokens`);

  const maxTokens = 500;
  const compressed = tokenManager.compressMessages(longMessages, maxTokens, {
    preserveSystem: true,
    preserveUser: true,
    compressAssistant: true,
    minMessagesToKeep: 2
  });
  const compressedTokens = tokenManager.countMessages(compressed);
  console.log(`   压缩后: ${compressed.length} 条, ${compressedTokens} tokens`);
  console.log(`   压缩比: ${((1 - compressedTokens / longTokens) * 100).toFixed(1)}%`);

  // 测试 4: 截断功能
  console.log('\n🧪 测试 4: 文本截断');
  const longText = '这是一个很长的文本，需要被截断到指定的Token数量。我们正在测试截断功能是否正常工作。这对于处理长上下文非常重要。';
  const truncated = tokenManager.truncate(longText, 20);
  const truncatedTokens = tokenManager.count(truncated);
  console.log(`   原文: ${tokenManager.count(longText)} tokens`);
  console.log(`   截断: ${truncatedTokens} tokens, 内容: "${truncated.slice(0, 30)}..."`);

  // 测试 5: Token 计数精度对比
  console.log('\n🧪 测试 5: 精度对比（估算 vs tiktoken）');
  const precisionTests = [
    '你好世界',
    'Hello world',
    'AI人工智能技术正在快速发展',
    'The quick brown fox jumps over the lazy dog',
    '今天天气真好，我们去公园散步吧！'
  ];

  let totalError = 0;
  for (const text of precisionTests) {
    const tiktokenCount = tokenManager.count(text);
    // 简单估算: 中文 1.5字符/token, 英文 4字符/token
    const chineseChars = (text.match(/[一-龥]/g) || []).length;
    const otherChars = text.length - chineseChars;
    const estimate = Math.ceil(chineseChars / 1.5 + otherChars / 4);
    const error = Math.abs(tiktokenCount - estimate) / tiktokenCount * 100;
    totalError += error;
    console.log(`   "${text.slice(0, 15)}..." tiktoken=${tiktokenCount}, 估算=${estimate}, 误差=${error.toFixed(1)}%`);
  }
  console.log(`   平均误差: ${(totalError / precisionTests.length).toFixed(1)}%`);

  // 清理
  tokenManager.destroy();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Token Manager 测试完成');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
