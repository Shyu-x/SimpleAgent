/**
 * ChatModelClient 单元测试
 *
 * 测试内容：
 * 1. 接口定义验证
 * 2. 常量导出验证
 */
const assert = require('assert');

function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + e.message);
    process.exitCode = 1;
  }
}

function describe(name, fn) {
  console.log('\n' + name + ':');
  fn();
}

const { ChatModelClient, ModelOptions, StreamEventType } = require('../../src/services/model/ChatModelClient');

describe('ChatModelClient 接口定义', () => {
  test('chat() 方法应该抛出错误', () => {
    const client = new ChatModelClient();
    try {
      client.chat({ messages: [] });
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('must be implemented'));
    }
  });

  test('chatStream() 方法应该抛出错误', () => {
    const client = new ChatModelClient();
    try {
      client.chatStream({ messages: [] }, () => {}, () => {}, () => {});
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('must be implemented'));
    }
  });

  test('getModelInfo() 方法应该抛出错误', () => {
    const client = new ChatModelClient();
    try {
      client.getModelInfo();
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('must be implemented'));
    }
  });

  test('healthCheck() 方法应该抛出错误', async () => {
    const client = new ChatModelClient();
    try {
      await client.healthCheck();
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('must be implemented'));
    }
  });
});

describe('ModelOptions 常量', () => {
  test('应该定义温度常量', () => {
    assert.strictEqual(ModelOptions.TEMPERATURE_DEFAULT, 0.7);
    assert.strictEqual(ModelOptions.TEMPERATURE_CREATIVE, 0.9);
    assert.strictEqual(ModelOptions.TEMPERATURE_PRECISE, 0.3);
  });

  test('应该定义 Token 限制常量', () => {
    assert.strictEqual(ModelOptions.MAX_TOKENS_DEFAULT, 8192);
    assert.strictEqual(ModelOptions.MAX_TOKENS_LONG, 32000);
    assert.strictEqual(ModelOptions.MAX_TOKENS_MAX, 100000);
  });

  test('应该定义超时常量', () => {
    assert.strictEqual(ModelOptions.TIMEOUT_DEFAULT, 120000);
    assert.strictEqual(ModelOptions.TIMEOUT_SHORT, 30000);
    assert.strictEqual(ModelOptions.TIMEOUT_LONG, 300000);
  });
});

describe('StreamEventType 常量', () => {
  test('应该定义流式事件类型', () => {
    assert.strictEqual(StreamEventType.TEXT_DELTA, 'text_delta');
    assert.strictEqual(StreamEventType.THINKING_DELTA, 'thinking_delta');
    assert.strictEqual(StreamEventType.MESSAGE_STOP, 'message_stop');
    assert.strictEqual(StreamEventType.ERROR, 'error');
  });
});

describe('ChatModelClient 继承测试', () => {
  class MockChatModelClient extends ChatModelClient {
    async chat(request) {
      return { content: 'mock response' };
    }

    async chatStream(request, onChunk, onComplete, onError) {
      onChunk({ text: 'chunk' });
      onComplete();
    }

    getModelInfo() {
      return { name: 'MockModel', version: '1.0' };
    }

    async healthCheck() {
      return true;
    }
  }

  test('子类应该能够正常实例化', () => {
    const mockClient = new MockChatModelClient();
    assert.ok(mockClient instanceof ChatModelClient);
  });

  test('子类 chat() 方法应该正常工作', async () => {
    const mockClient = new MockChatModelClient();
    const result = await mockClient.chat({ messages: [{ role: 'user', content: 'hello' }] });
    assert.deepStrictEqual(result, { content: 'mock response' });
  });

  test('子类 getModelInfo() 方法应该正常工作', () => {
    const mockClient = new MockChatModelClient();
    const info = mockClient.getModelInfo();
    assert.deepStrictEqual(info, { name: 'MockModel', version: '1.0' });
  });

  test('子类 healthCheck() 方法应该正常工作', async () => {
    const mockClient = new MockChatModelClient();
    const result = await mockClient.healthCheck();
    assert.strictEqual(result, true);
  });
});

console.log('\n');
