/**
 * SearchChannel 检索通道 单元测试
 *
 * 测试内容：
 * 1. SearchChannel 基类
 * 2. SearchResult 结果类
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

const { SearchChannel, SearchResult } = require('../../src/services/search/SearchChannel');

describe('SearchChannel 构造函数', () => {
  test('默认配置应该正确', () => {
    const channel = new SearchChannel();
    assert.strictEqual(channel.name, 'unknown');
    assert.strictEqual(channel.weight, 1.0);
    assert.strictEqual(channel.timeout, 30000);
    assert.strictEqual(channel.enabled, true);
  });

  test('自定义配置应该正确应用', () => {
    const channel = new SearchChannel({
      name: 'test-channel',
      weight: 2.0,
      timeout: 5000,
      enabled: false
    });
    assert.strictEqual(channel.name, 'test-channel');
    assert.strictEqual(channel.weight, 2.0);
    assert.strictEqual(channel.timeout, 5000);
    assert.strictEqual(channel.enabled, false);
  });
});

describe('SearchChannel search 方法', () => {
  test('基类 search() 应该抛出错误', async () => {
    const channel = new SearchChannel({ name: 'test' });
    try {
      await channel.search('query');
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('must be implemented'));
    }
  });
});

describe('SearchChannel searchBatch 方法', () => {
  test('应该批量执行搜索', async () => {
    class TestChannel extends SearchChannel {
      async search(query, options = {}) {
        return [new SearchResult({ id: query, content: `result for ${query}`, score: 0.9 })];
      }
    }

    const channel = new TestChannel({ name: 'batch-test' });
    const results = await channel.searchBatch(['query1', 'query2', 'query3']);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0][0].content, 'result for query1');
    assert.strictEqual(results[1][0].content, 'result for query2');
    assert.strictEqual(results[2][0].content, 'result for query3');
  });
});

describe('SearchChannel healthCheck 方法', () => {
  test('基类应该默认返回 true', async () => {
    const channel = new SearchChannel();
    const result = await channel.healthCheck();
    assert.strictEqual(result, true);
  });
});

describe('SearchChannel getInfo 方法', () => {
  test('应该返回通道信息', () => {
    const channel = new SearchChannel({
      name: 'info-test',
      weight: 1.5,
      timeout: 10000,
      enabled: true
    });

    const info = channel.getInfo();
    assert.strictEqual(info.name, 'info-test');
    assert.strictEqual(info.weight, 1.5);
    assert.strictEqual(info.timeout, 10000);
    assert.strictEqual(info.enabled, true);
  });
});

describe('SearchResult 构造函数', () => {
  test('默认配置应该正确', () => {
    const result = new SearchResult({});
    assert.strictEqual(result.id, '');
    assert.strictEqual(result.content, '');
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.source, 'unknown');
    assert.deepStrictEqual(result.metadata, {});
    assert.strictEqual(result.channel, 'unknown');
  });

  test('自定义数据应该正确应用', () => {
    const result = new SearchResult({
      id: 'result-123',
      content: 'test content',
      score: 0.85,
      source: 'test-source',
      metadata: { key: 'value' },
      channel: 'test-channel'
    });
    assert.strictEqual(result.id, 'result-123');
    assert.strictEqual(result.content, 'test content');
    assert.strictEqual(result.score, 0.85);
    assert.strictEqual(result.source, 'test-source');
    assert.deepStrictEqual(result.metadata, { key: 'value' });
    assert.strictEqual(result.channel, 'test-channel');
  });
});

describe('SearchResult isTrusted 方法', () => {
  test('默认阈值 0.5 应该正确判断', () => {
    const resultHigh = new SearchResult({ score: 0.8 });
    const resultLow = new SearchResult({ score: 0.3 });
    assert.strictEqual(resultHigh.isTrusted(), true);
    assert.strictEqual(resultLow.isTrusted(), false);
  });

  test('自定义阈值应该正确判断', () => {
    const result = new SearchResult({ score: 0.6 });
    assert.strictEqual(result.isTrusted(0.5), true);
    assert.strictEqual(result.isTrusted(0.7), false);
  });

  test('边界值应该正确处理', () => {
    const resultEqual = new SearchResult({ score: 0.5 });
    assert.strictEqual(resultEqual.isTrusted(0.5), true);
    const resultJustBelow = new SearchResult({ score: 0.499 });
    assert.strictEqual(resultJustBelow.isTrusted(0.5), false);
  });
});

describe('SearchResult toJSON 方法', () => {
  test('应该正确序列化为 JSON', () => {
    const result = new SearchResult({
      id: 'json-test',
      content: 'test content',
      score: 0.9,
      source: 'json-source',
      metadata: { type: 'test' },
      channel: 'json-channel'
    });

    const json = result.toJSON();
    assert.strictEqual(json.id, 'json-test');
    assert.strictEqual(json.content, 'test content');
    assert.strictEqual(json.score, 0.9);
    assert.strictEqual(json.source, 'json-source');
    assert.deepStrictEqual(json.metadata, { type: 'test' });
    assert.strictEqual(json.channel, 'json-channel');
  });
});

describe('SearchChannel 子类实现测试', () => {
  class VectorSearchChannel extends SearchChannel {
    constructor(options = {}) {
      super({ name: options.name || 'vector', weight: options.weight || 1.5, ...options });
      this.dimension = options.dimension || 128;
    }

    async search(query, options = {}) {
      return [new SearchResult({
        id: `vec-${query}`,
        content: `Vector search result for: ${query}`,
        score: 0.95,
        source: 'vector-db',
        metadata: { dimension: this.dimension },
        channel: this.name
      })];
    }

    async healthCheck() { return true; }
  }

  class KeywordSearchChannel extends SearchChannel {
    constructor(options = {}) {
      super({ name: options.name || 'keyword', weight: options.weight || 1.0, ...options });
    }

    async search(query, options = {}) {
      const topK = options.topK || 5;
      const results = [];
      for (let i = 0; i < Math.min(topK, 3); i++) {
        results.push(new SearchResult({
          id: `kw-${query}-${i}`,
          content: `Keyword match ${i + 1} for: ${query}`,
          score: 0.9 - (i * 0.1),
          source: 'keyword-index',
          channel: this.name
        }));
      }
      return results;
    }
  }

  test('VectorSearchChannel 应该正确实现搜索功能', async () => {
    const channel = new VectorSearchChannel({ name: 'test-vector' });
    const results = await channel.search('machine learning');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].content, 'Vector search result for: machine learning');
    assert.strictEqual(results[0].score, 0.95);
  });

  test('KeywordSearchChannel 应该返回多个结果', async () => {
    const channel = new KeywordSearchChannel();
    const results = await channel.search('javascript');
    assert.strictEqual(results.length, 3);
    assert.ok(results[0].score >= results[1].score);
    assert.ok(results[1].score >= results[2].score);
  });

  test('KeywordSearchChannel 应该支持 topK 参数', async () => {
    const channel = new KeywordSearchChannel();
    const results = await channel.search('python', { topK: 2 });
    assert.strictEqual(results.length, 2);
  });
});

console.log('\n');
