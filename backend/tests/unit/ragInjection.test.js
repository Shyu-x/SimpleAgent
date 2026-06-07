/**
 * B5 RAG-1: 知识库上下文注入单元测试
 *
 * 验证 sseService.injectRagContext 的行为：
 * 1. 知识意图 + 有 KB 命中 → 注入 [知识库: ...] 系统消息
 * 2. 工具/闲聊/任务意图 → 不注入
 * 3. 无 KB / KB 超时 → 优雅降级
 * 4. IntentClassifier 抛错 → 降级不注入
 */
const assert = require('assert');
const SSEService = require('../../src/services/sseService');

const { injectRagContext } = SSEService;

const makeMessages = () => [
  { role: 'system', content: 'sys' },
  { role: 'user', content: '什么是 RAG' }
];

const makeKnowledgeClassifier = () => ({
  classify: async () => ({ domain: 'knowledge', intent: 'knowledge', confidence: 0.9 })
});

const makeNonKnowledgeClassifier = (domain = 'chat', intent = 'chat') => ({
  classify: async () => ({ domain, intent, confidence: 0.9 })
});

const makeRagService = ({ kbs = [], contexts = {}, delay = 0 } = {}) => ({
  listKnowledgeBases: () => kbs,
  getContextForConversation: async (kbId, q, opts) => {
    if (delay) await new Promise(r => setTimeout(r, delay));
    return contexts[kbId] || null;
  }
});

describe('B5 RAG-1: injectRagContext 知识库上下文注入', () => {
  test('知识意图 + 有 KB 命中 → 注入 [知识库: ...] 系统消息', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: '技术文档' }],
        contexts: { kb1: { context: 'RAG 是检索增强生成...', count: 2 } }
      })
    });
    assert.strictEqual(result.length, 3, '应多出一条 system 消息');
    assert.ok(result[1].content.includes('[知识库: 技术文档]'), '应包含 [知识库: 技术文档]');
    assert.ok(result[1].content.includes('RAG 是检索增强生成'), '应包含 KB 内容');
    assert.strictEqual(result[2].role, 'user', '原 user 消息应在 KB 之后');
  });

  test('知识意图 + 无 KB → 不注入（原样返回）', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService({ kbs: [] })
    });
    assert.strictEqual(result.length, 2, '消息数不变');
    assert.strictEqual(result[0].content, 'sys', '原 system 不变');
  });

  test('工具意图 → 不注入', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '计算 1+1', {
      intentClassifier: makeNonKnowledgeClassifier('tool_use', 'tool_use'),
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: 'kb1' }],
        contexts: { kb1: { context: 'should not inject', count: 1 } }
      })
    });
    assert.strictEqual(result.length, 2, '工具意图不注入 KB');
  });

  test('闲聊意图 → 不注入', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '你好', {
      intentClassifier: makeNonKnowledgeClassifier('daily_communication', 'chat'),
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: 'kb1' }],
        contexts: { kb1: { context: 'should not inject', count: 1 } }
      })
    });
    assert.strictEqual(result.length, 2, '闲聊意图不注入 KB');
  });

  test('KB 超时（>2s）→ 跳过该 KB，降级返回原消息', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: 'kb1' }],
        contexts: {},
        delay: 3000
      })
    });
    assert.strictEqual(result.length, 2, '超时后不注入');
  });

  test('KB 返回 null context → 优雅降级', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: 'kb1' }],
        contexts: { kb1: null }
      })
    });
    assert.strictEqual(result.length, 2, 'context 为 null 时不注入');
  });

  test('IntentClassifier 抛错 → 不注入（原样返回）', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: {
        classify: async () => { throw new Error('classifier down'); }
      },
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: 'kb1' }],
        contexts: { kb1: { context: 'x', count: 1 } }
      })
    });
    assert.strictEqual(result.length, 2, '分类器失败时降级');
  });

  test('空查询 → 直接返回原 messages', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService()
    });
    assert.strictEqual(result.length, 2);
  });

  test('多 KB 时使用第一个有 context 的', async () => {
    const messages = makeMessages();
    const result = await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService({
        kbs: [
          { id: 'kb1', name: '空 KB' },
          { id: 'kb2', name: '技术文档' }
        ],
        contexts: {
          kb1: null,
          kb2: { context: '有用的内容', count: 1 }
        }
      })
    });
    assert.strictEqual(result.length, 3);
    assert.ok(result[1].content.includes('[知识库: 技术文档]'), '应使用第二个 KB');
  });

  test('不应修改原 messages（不可变）', async () => {
    const messages = makeMessages();
    const before = JSON.stringify(messages);
    await injectRagContext(messages, '什么是 RAG', {
      intentClassifier: makeKnowledgeClassifier(),
      ragService: makeRagService({
        kbs: [{ id: 'kb1', name: 'kb1' }],
        contexts: { kb1: { context: 'x', count: 1 } }
      })
    });
    const after = JSON.stringify(messages);
    assert.strictEqual(before, after, '原 messages 不应被修改');
  });
});
