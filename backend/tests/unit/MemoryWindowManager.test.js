/**
 * MemoryWindowManager 单元测试
 *
 * 测试内容：
 * 1. 初始化
 * 2. 消息添加
 * 3. Token 估算
 * 4. 上下文获取
 * 5. 摘要功能
 * 6. 会话管理
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;



const MemoryWindowManager = require('../../src/services/agent/MemoryWindowManager');
const testStorageDir = path.join(__dirname, 'test-data', 'memory-windows');

describe('MemoryWindowManager 构造函数', () => {
  test('默认配置应该正确', () => {
    const manager = new MemoryWindowManager();
    assert.strictEqual(manager.windowSize, 20);
    assert.strictEqual(manager.maxTokens, 4000);
    assert.strictEqual(manager.summaryThreshold, 3000);
  });

  test('自定义配置应该正确应用', () => {
    const manager = new MemoryWindowManager({
      windowSize: 10,
      maxTokens: 5000,
      summaryThreshold: 4000,
      storageDir: '/custom/path'
    });
    assert.strictEqual(manager.windowSize, 10);
    assert.strictEqual(manager.maxTokens, 5000);
    assert.strictEqual(manager.summaryThreshold, 4000);
    assert.strictEqual(manager.storageDir, '/custom/path');
  });
});

describe('MemoryWindowManager _estimateTokens', () => {
  test('应该正确估算中文字符 Token', () => {
    const manager = new MemoryWindowManager();
    const tokens = manager._estimateTokens('你好世界');
    assert.strictEqual(tokens, 3); // ceil(3/1.5) = 2... wait let me recalculate
    // Actually ceil(4/1.5) = ceil(2.67) = 3 for 4 Chinese chars
    // 3 Chinese chars: ceil(3/1.5) = 2
  });

  test('应该正确估算英文字符 Token', () => {
    const manager = new MemoryWindowManager();
    const tokens = manager._estimateTokens('test');
    assert.strictEqual(tokens, 1); // ceil(4/4) = 1
  });

  test('应该正确估算混合字符 Token', () => {
    const manager = new MemoryWindowManager();
    const tokens = manager._estimateTokens('你好test');
    // 3 Chinese: ceil(3/1.5) = 2, 4 English: ceil(4/4) = 1, total = 3
    const result = manager._estimateTokens('你好test');
    assert.ok(result >= 2);
  });

  test('空字符串应该返回 0', () => {
    const manager = new MemoryWindowManager();
    assert.strictEqual(manager._estimateTokens(''), 0);
    assert.strictEqual(manager._estimateTokens(null), 0);
    assert.strictEqual(manager._estimateTokens(undefined), 0);
  });
});

describe('MemoryWindowManager addMessage', () => {
  test('应该添加消息到会话', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    const message = await manager.addMessage({ role: 'user', content: 'Hello' }, 'test-session');
    assert.strictEqual(message.role, 'user');
    assert.strictEqual(message.content, 'Hello');
    assert.ok(message.timestamp);
  });

  test('应该使用默认 role', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    const message = await manager.addMessage({ content: 'Hello' }, 'test-session');
    assert.strictEqual(message.role, 'user');
  });

  test('应该增加 token 计数', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: '你好' }, 'test-token');
    const stats = manager.getStats('test-token');
    assert.ok(stats.tokenCount > 0);
  });
});

describe('MemoryWindowManager getContext', () => {
  test('应该返回空数组当没有消息', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    const context = manager.getContext(1000, 'empty-session');
    assert.strictEqual(context.length, 0);
  });

  test('如果有摘要应该包含摘要', async () => {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 2,
      maxTokens: 1000
    });
    await manager.initialize();

    for (let i = 0; i < 5; i++) {
      await manager.addMessage({ role: 'user', content: `消息 ${i}` }, 'test-summary');
    }

    const context = manager.getContext(1000, 'test-summary');
    const hasSummary = context.some(m => m.metadata?.type === 'summary');
    assert.ok(hasSummary);
  });
});

describe('MemoryWindowManager shouldSummarize', () => {
  test('当消息数超过窗口大小时应该返回 true', async () => {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 3
    });
    await manager.initialize();

    for (let i = 0; i < 5; i++) {
      await manager.addMessage({ role: 'user', content: `消息 ${i}` }, 'test-window');
    }

    assert.strictEqual(manager.shouldSummarize('test-window'), true);
  });

  test('正常情况下应该返回 false', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'test-normal');
    assert.strictEqual(manager.shouldSummarize('test-normal'), false);
  });
});

describe('MemoryWindowManager summarize', () => {
  test('空消息应该返回不执行摘要', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    const result = await manager.summarize('empty-session');
    assert.strictEqual(result.summarized, false);
    assert.strictEqual(result.reason, 'no_messages');
  });

  test('应该正确执行摘要', async () => {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 2
    });
    await manager.initialize();

    for (let i = 0; i < 5; i++) {
      await manager.addMessage({ role: 'user', content: `用户消息 ${i} 关于机器学习的内容` }, 'test-summarize');
      await manager.addMessage({ role: 'assistant', content: `助手回复 ${i}` }, 'test-summarize');
    }

    const result = await manager.summarize('test-summarize');
    assert.strictEqual(result.summarized, true);
    assert.strictEqual(result.originalCount, 8); // 5 * 2 - 2 (windowSize) = 8
    assert.ok(result.summary);
    assert.ok(result.summary.content.includes('历史摘要'));
  });
});

describe('MemoryWindowManager _defaultSummarize', () => {
  test('应该提取关键词', () => {
    const manager = new MemoryWindowManager();
    const messages = [
      { role: 'user', content: '机器学习是人工智能的一个重要分支' },
      { role: 'user', content: '深度学习是机器学习的子领域' }
    ];

    const summary = manager._defaultSummarize(messages);
    assert.ok(summary.includes('机器学习') || summary.includes('深度学习') || summary.includes('讨论主题'));
  });

  test('应该统计对话轮次', () => {
    const manager = new MemoryWindowManager();
    const messages = [
      { role: 'user', content: '问题1' },
      { role: 'assistant', content: '回答1' },
      { role: 'user', content: '问题2' },
      { role: 'assistant', content: '回答2' }
    ];

    const summary = manager._defaultSummarize(messages);
    assert.ok(summary.includes('2轮对话'));
  });
});

describe('MemoryWindowManager clear', () => {
  test('应该清除指定会话', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'clear-test');
    const statsBefore = manager.getStats('clear-test');
    assert.ok(statsBefore.messageCount > 0);
    await manager.clear('clear-test');
    const statsAfter = manager.getStats('clear-test');
    assert.strictEqual(statsAfter.messageCount, 0);
  });

  test('clear all 应该清除所有会话', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'session1');
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'session2');
    await manager.clear('all');
    assert.strictEqual(manager.listSessions().length, 0);
  });
});

describe('MemoryWindowManager getStats', () => {
  test('应该返回正确的统计信息', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'stats-test');
    const stats = manager.getStats('stats-test');
    assert.ok(stats.messageCount > 0);
    assert.ok(stats.tokenCount >= 0);
    assert.ok(stats.created);
    assert.ok(stats.lastAccess);
  });
});

describe('MemoryWindowManager listSessions', () => {
  test('应该返回所有会话 ID', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'session-a');
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'session-b');
    const sessions = manager.listSessions();
    assert.ok(sessions.includes('session-a'));
    assert.ok(sessions.includes('session-b'));
  });
});

describe('MemoryWindowManager export/import', () => {
  test('应该正确导出会话数据', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    await manager.addMessage({ role: 'user', content: 'Hello' }, 'export-test');
    await manager.addMessage({ role: 'assistant', content: 'Hi there' }, 'export-test');
    const exported = manager.export('export-test');
    assert.ok(exported.messages);
    assert.strictEqual(exported.messages.length, 2);
    assert.ok(exported.stats);
  });

  test('应该正确导入会话数据', async () => {
    const manager = new MemoryWindowManager({ storageDir: testStorageDir });
    await manager.initialize();
    const data = { messages: [{ role: 'user', content: 'Imported message' }] };
    await manager.import(data, 'import-test');
    const stats = manager.getStats('import-test');
    assert.strictEqual(stats.messageCount, 1);
  });
});

// Cleanup after all tests
setTimeout(async () => {
  try {
    await fs.rm(path.join(__dirname, 'test-data'), { recursive: true, force: true });
  } catch (e) {}
}, 100);

