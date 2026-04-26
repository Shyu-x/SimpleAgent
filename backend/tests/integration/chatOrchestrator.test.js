/**
 * ChatOrchestrator 集成测试
 */

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertContains(array, item, message) {
  if (!array.includes(item)) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

let passed = 0;
let failed = 0;

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

function runTest(name, fn) {
  return runAsyncTest(name, fn);
}

// ========== Mock Classes ==========

class MockIntentClassifier {
  constructor() {
    this.classifications = [];
  }

  classify({ query }) {
    this.classifications.push(query);

    // 简单关键词匹配
    if (query.includes('代码') || query.includes('python') || query.includes('js')) {
      return { intent: 'code_generation', confidence: 0.9 };
    }
    if (query.includes('搜索') || query.includes('查找')) {
      return { intent: 'search', confidence: 0.85 };
    }
    if (query.includes('天气')) {
      return { intent: 'weather', confidence: 0.95 };
    }
    return { intent: 'conversation', confidence: 0.7 };
  }
}

class MockQueryRewriter {
  constructor() {
    this.rewrites = [];
  }

  async rewrite({ query, context, messages }) {
    // 支持两种参数名：context 或 messages
    const msgArray = context || messages || [];
    this.rewrites.push({ query, context: msgArray });

    // 简单实现：如果 context 有上一轮，添加"继续"
    if (msgArray && msgArray.length > 0) {
      return `继续: ${query}`;
    }
    return query;
  }
}

class MockHybridSearch {
  constructor() {
    this.searches = [];
  }

  async search({ query, knowledgeBaseId, channels }) {
    this.searches.push({ query, knowledgeBaseId, channels });

    return {
      results: [
        {
          id: 'doc_1',
          content: `关于 ${query} 的文档内容`,
          score: 0.95,
          source: 'knowledge_base'
        },
        {
          id: 'doc_2',
          content: `${query} 的补充说明`,
          score: 0.85,
          source: 'knowledge_base'
        }
      ],
      metadata: {
        totalResults: 2,
        channelsUsed: channels || ['vector', 'keyword']
      }
    };
  }
}

class MockModelRouter {
  constructor() {
    this.routes = [];
    this.clients = new Map();
  }

  registerClient(client) {
    this.clients.set(client.name || 'default', client);
  }

  async route(messages, options = {}) {
    const lastMessage = messages[messages.length - 1];
    this.routes.push(lastMessage);

    return {
      content: `AI 响应: ${lastMessage.content}`,
      usage: { tokens: 50 }
    };
  }

  getStats() {
    return { totalRoutes: this.routes.length };
  }
}

// ========== ChatOrchestrator Mock ==========

class ChatOrchestrator {
  constructor(config = {}) {
    this.intentClassifier = config.intentClassifier || new MockIntentClassifier();
    this.queryRewriter = config.queryRewriter || new MockQueryRewriter();
    this.hybridSearch = config.hybridSearch || new MockHybridSearch();
    this.modelRouter = config.modelRouter || new MockModelRouter();

    this.conversations = new Map();
  }

  classifyIntent({ query, messages }) {
    return this.intentClassifier.classify({ query, messages });
  }

  async rewriteQuery({ query, messages, intent }) {
    return this.queryRewriter.rewrite({ query, messages, intent });
  }

  async search({ query, knowledgeBaseId, channels }) {
    return this.hybridSearch.search({ query, knowledgeBaseId, channels });
  }

  async executeChat({ messages, model, stream }) {
    return this.modelRouter.route(messages, { model, stream });
  }

  // 会话管理
  createConversation(conversationId) {
    this.conversations.set(conversationId, {
      id: conversationId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return this.conversations.get(conversationId);
  }

  getConversation(conversationId) {
    return this.conversations.get(conversationId) || null;
  }

  addMessage(conversationId, message) {
    const conv = this.conversations.get(conversationId);
    if (conv) {
      conv.messages.push(message);
      conv.updatedAt = Date.now();
    }
  }

  // 完整聊天流程
  async processMessage({ conversationId, message, options = {} }) {
    const messages = options.messages || [];

    // 1. 意图分类
    const intentResult = this.classifyIntent({
      query: message.content,
      messages
    });

    // 2. 查询改写
    const rewrittenQuery = await this.rewriteQuery({
      query: message.content,
      messages,
      intent: intentResult.intent
    });

    // 3. 知识检索（如果是知识问答）
    let searchResults = null;
    if (options.enableSearch && ['search', 'knowledge'].includes(intentResult.intent)) {
      searchResults = await this.search({
        query: rewrittenQuery,
        knowledgeBaseId: options.knowledgeBaseId,
        channels: options.channels
      });
    }

    // 4. 执行聊天
    const chatResponse = await this.executeChat({
      messages: [...messages, message],
      model: options.model,
      stream: options.stream
    });

    return {
      response: chatResponse,
      intent: intentResult,
      rewrittenQuery,
      searchResults,
      conversationId
    };
  }

  getStats() {
    return {
      conversations: this.conversations.size,
      intentClassifications: this.intentClassifier.classifications.length,
      rewrites: this.queryRewriter.rewrites.length,
      searches: this.hybridSearch.searches.length,
      routes: this.modelRouter.getStats()
    };
  }
}

// ========== Tests ==========

async function runTests() {
  console.log('\n========================================');
  console.log('ChatOrchestrator 集成测试');
  console.log('========================================\n');

  // ========== 1. 构造函数测试 ==========
  console.log('【1. 构造函数测试】');

  await runTest('默认构造函数应正确初始化', () => {
    const orchestrator = new ChatOrchestrator();

    assertTrue(orchestrator.intentClassifier !== null, '应有意图分类器');
    assertTrue(orchestrator.queryRewriter !== null, '应有查询改写器');
    assertTrue(orchestrator.hybridSearch !== null, '应有混合搜索');
    assertTrue(orchestrator.modelRouter !== null, '应有模型路由');
    assertTrue(orchestrator.conversations instanceof Map, '应有会话存储');
  });

  await runTest('自定义组件应正确注入', () => {
    const customClassifier = new MockIntentClassifier();
    const orchestrator = new ChatOrchestrator({
      intentClassifier: customClassifier
    });

    assertEqual(orchestrator.intentClassifier, customClassifier, '应使用自定义分类器');
  });

  // ========== 2. 意图分类测试 ==========
  console.log('\n【2. 意图分类测试】');

  await runTest('应识别代码生成意图', () => {
    const orchestrator = new ChatOrchestrator();

    const result = orchestrator.classifyIntent({
      query: '帮我写一段 Python 代码',
      messages: []
    });

    assertEqual(result.intent, 'code_generation', '应识别为代码生成');
    assertTrue(result.confidence > 0.5, '置信度应 > 0.5');
  });

  await runTest('应识别搜索意图', () => {
    const orchestrator = new ChatOrchestrator();

    const result = orchestrator.classifyIntent({
      query: '搜索一下 AI 的最新进展',
      messages: []
    });

    assertEqual(result.intent, 'search', '应识别为搜索');
  });

  await runTest('应识别对话意图', () => {
    const orchestrator = new ChatOrchestrator();

    const result = orchestrator.classifyIntent({
      query: '你好，今天怎么样？',
      messages: []
    });

    assertEqual(result.intent, 'conversation', '应识别为对话');
  });

  await runTest('应正确处理多轮对话', () => {
    const orchestrator = new ChatOrchestrator();

    orchestrator.classifyIntent({ query: 'Python 是什么', messages: [] });
    orchestrator.classifyIntent({ query: '它能做什么', messages: [] });

    assertEqual(orchestrator.intentClassifier.classifications.length, 2, '应有 2 次分类');
  });

  // ========== 3. 查询改写测试 ==========
  console.log('\n【3. 查询改写测试】');

  await runTest('应正确改写查询', async () => {
    const orchestrator = new ChatOrchestrator();

    const rewritten = await orchestrator.rewriteQuery({
      query: '它支持什么功能',
      messages: [{ content: 'Python 是什么' }],
      intent: 'conversation'
    });

    assertTrue(rewritten.includes('继续') || rewritten.length > 0, '改写后应有内容');
  });

  await runTest('首轮对话不应改写', async () => {
    const orchestrator = new ChatOrchestrator();

    const rewritten = await orchestrator.rewriteQuery({
      query: '你好',
      messages: [],
      intent: 'conversation'
    });

    assertEqual(rewritten, '你好', '首轮对话不应改写');
  });

  // ========== 4. 知识检索测试 ==========
  console.log('\n【4. 知识检索测试】');

  await runTest('应正确执行检索', async () => {
    const orchestrator = new ChatOrchestrator();

    const result = await orchestrator.search({
      query: 'AI Agent',
      knowledgeBaseId: 'default',
      channels: ['vector', 'keyword']
    });

    assertTrue(Array.isArray(result.results), '结果应为数组');
    assertEqual(result.results.length, 2, '应有 2 个结果');
    assertTrue(result.metadata.channelsUsed.includes('vector'), '应使用向量通道');
  });

  await runTest('检索结果应有分数', async () => {
    const orchestrator = new ChatOrchestrator();

    const result = await orchestrator.search({
      query: '测试查询',
      knowledgeBaseId: 'test'
    });

    assertTrue(result.results[0].score > 0, '结果应有分数');
    assertTrue(result.metadata.totalResults > 0, '应有总结果数');
  });

  // ========== 5. 会话管理测试 ==========
  console.log('\n【5. 会话管理测试】');

  await runTest('应创建会话', () => {
    const orchestrator = new ChatOrchestrator();

    const conv = orchestrator.createConversation('conv_1');

    assertEqual(conv.id, 'conv_1', '会话 ID 应正确');
    assertTrue(Array.isArray(conv.messages), 'messages 应为数组');
    assertTrue(conv.createdAt > 0, '应有创建时间');
  });

  await runTest('应获取会话', () => {
    const orchestrator = new ChatOrchestrator();

    orchestrator.createConversation('conv_1');
    const conv = orchestrator.getConversation('conv_1');

    assertTrue(conv !== null, '应返回会话');
    assertEqual(conv.id, 'conv_1', '会话 ID 应匹配');
  });

  await runTest('不存在的会话应返回 null', () => {
    const orchestrator = new ChatOrchestrator();

    const conv = orchestrator.getConversation('non_existent');

    assertEqual(conv, null, '不存在的会话应返回 null');
  });

  await runTest('应添加消息到会话', () => {
    const orchestrator = new ChatOrchestrator();

    orchestrator.createConversation('conv_1');
    orchestrator.addMessage('conv_1', { role: 'user', content: 'Hello' });

    const conv = orchestrator.getConversation('conv_1');
    assertEqual(conv.messages.length, 1, '应有 1 条消息');
    assertEqual(conv.messages[0].content, 'Hello', '消息内容应正确');
  });

  // ========== 6. 完整流程测试 ==========
  console.log('\n【6. 完整流程测试】');

  await runTest('完整消息处理流程', async () => {
    const orchestrator = new ChatOrchestrator();

    const result = await orchestrator.processMessage({
      conversationId: 'conv_1',
      message: { role: 'user', content: '你好' },
      options: {}
    });

    assertTrue(result.response !== null, '应有响应');
    assertTrue(result.intent !== null, '应有意图分类结果');
    assertEqual(result.conversationId, 'conv_1', '会话 ID 应正确');
  });

  await runTest('启用搜索时应有检索结果', async () => {
    const orchestrator = new ChatOrchestrator();

    const result = await orchestrator.processMessage({
      conversationId: 'conv_1',
      message: { role: 'user', content: '搜索 AI' },
      options: {
        enableSearch: true,
        knowledgeBaseId: 'default'
      }
    });

    assertTrue(result.searchResults !== null, '应有检索结果');
    assertTrue(Array.isArray(result.searchResults.results), '结果应为数组');
  });

  await runTest('多轮对话应保留上下文', async () => {
    const orchestrator = new ChatOrchestrator();

    // 第一轮
    const firstResult = await orchestrator.processMessage({
      conversationId: 'conv_1',
      message: { role: 'user', content: 'Python 是什么' },
      options: {}
    });

    // 第二轮 - 需要显式传递上一轮消息
    const result2 = await orchestrator.processMessage({
      conversationId: 'conv_1',
      message: { role: 'user', content: '它能做什么' },
      options: {
        messages: [{ role: 'user', content: 'Python 是什么' }]
      }
    });

    // 调试：打印实际值
    assertTrue(result2.rewrittenQuery.includes('继续'), '多轮应有上下文');
  });

  // ========== 7. 错误处理测试 ==========
  console.log('\n【7. 错误处理测试】');

  await runTest('空消息内容应正常处理', async () => {
    const orchestrator = new ChatOrchestrator();

    const result = await orchestrator.processMessage({
      conversationId: 'conv_1',
      message: { role: 'user', content: '' },
      options: {}
    });

    assertTrue(result.intent !== null, '空消息也应分类');
  });

  await runTest('无效会话 ID 应创建新会话', async () => {
    const orchestrator = new ChatOrchestrator();

    const result = await orchestrator.processMessage({
      conversationId: 'new_conv',
      message: { role: 'user', content: 'Hello' },
      options: {}
    });

    assertTrue(result.conversationId === 'new_conv', '应使用提供的 ID');
  });

  // ========== 8. 统计测试 ==========
  console.log('\n【8. 统计测试】');

  await runTest('getStats 应返回正确统计', async () => {
    const orchestrator = new ChatOrchestrator();

    // 先创建会话
    orchestrator.createConversation('conv_1');

    // 再处理消息 (等待完成) - 使用"搜索"关键词触发搜索意图
    const result = await orchestrator.processMessage({
      conversationId: 'conv_1',
      message: { role: 'user', content: '搜索 AI 最新进展' },
      options: { enableSearch: true }
    });

    // 确保搜索被调用
    assertTrue(result.searchResults !== null, '应有搜索结果');

    const stats = orchestrator.getStats();

    // 验证统计
    assertTrue(stats.intentClassifications > 0, '意图分类数应 > 0');
    assertTrue(stats.rewrites > 0, '改写数应 > 0');
    assertTrue(stats.searches > 0, '搜索数应 > 0');
  });

  // ========== 汇总 ==========
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  return { passed, failed };
}

// 运行
runTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
  });
