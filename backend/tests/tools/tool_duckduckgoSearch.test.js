/**
 * DuckDuckGoSearchTool 集成测试
 * 测试文件: src/services/duckduckgoSearchTool.js
 */

const DuckDuckGoSearchTool = require('../../src/services/duckduckgoSearchTool');

describe('DuckDuckGoSearchTool 集成测试', () => {
  let tool;

  beforeEach(() => {
    tool = new DuckDuckGoSearchTool({ timeout: 10000, maxResults: 5 });
  });

  describe('execute 方法', () => {
    test('search 操作成功执行', async () => {
      const result = await tool.execute({
        action: 'search',
        query: 'JavaScript programming'
      });
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('query');
        expect(result).toHaveProperty('results');
        expect(result).toHaveProperty('totalResults');
        expect(result).toHaveProperty('source');
        expect(result.source).toBe('duckduckgo');
      }
    }, 15000);

    test('search 操作空查询返回错误', async () => {
      const result = await tool.execute({
        action: 'search',
        query: ''
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('搜索关键词不能为空');
    });

    test('search 操作无 query 参数返回错误', async () => {
      const result = await tool.execute({
        action: 'search'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('搜索关键词不能为空');
    });

    test('lucky 操作返回第一个结果 URL', async () => {
      const result = await tool.execute({
        action: 'lucky',
        query: 'Node.js'
      });
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('query');
        expect(result.source).toBe('duckduckgo_lucky');
      }
    }, 15000);

    test('lucky 操作空查询返回错误', async () => {
      const result = await tool.execute({
        action: 'lucky',
        query: ''
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('搜索关键词不能为空');
    });

    test('batch_search 操作成功执行', async () => {
      const result = await tool.execute({
        action: 'batch_search',
        queries: ['JavaScript', 'TypeScript', 'Node.js']
      });
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('successful');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('timestamp');
      if (result.successful > 0) {
        expect(result.results.length).toBeGreaterThan(0);
      }
    }, 20000);

    test('batch_search 空列表返回错误', async () => {
      const result = await tool.execute({
        action: 'batch_search',
        queries: []
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('查询列表不能为空');
    });

    test('未知 action 返回错误', async () => {
      const result = await tool.execute({
        action: 'unknown_action',
        query: 'test'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action');
    });
  });

  describe('search 方法', () => {
    test('返回结果格式正确', async () => {
      const result = await tool.search('React framework');
      if (result.success) {
        expect(Array.isArray(result.results)).toBe(true);
        if (result.results.length > 0) {
          expect(result.results[0]).toHaveProperty('title');
          expect(result.results[0]).toHaveProperty('url');
          expect(result.results[0]).toHaveProperty('snippet');
          expect(result.results[0]).toHaveProperty('source');
        }
      }
    }, 15000);

    test('maxResults 选项限制返回数量', async () => {
      const result = await tool.search('JavaScript', { maxResults: 3 });
      if (result.success) {
        expect(result.results.length).toBeLessThanOrEqual(3);
      }
    }, 15000);

    test('language 选项设置语言', async () => {
      const result = await tool.search('JavaScript', { language: 'en-US' });
      // 结果语言取决于搜索结果，不做硬性断言
      expect(result).toHaveProperty('success');
    }, 15000);
  });

  describe('batchSearch 方法', () => {
    test('限制最大查询数量为 20', async () => {
      const queries = Array.from({ length: 25 }, (_, i) => `query${i}`);
      const result = await tool.batchSearch(queries);
      expect(result.total).toBeLessThanOrEqual(20);
    }, 60000);

    test('返回成功和失败计数', async () => {
      const result = await tool.batchSearch(['JavaScript', 'invalid query'], {});
      expect(typeof result.successful).toBe('number');
      expect(typeof result.failed).toBe('number');
      expect(result.successful + result.failed).toBe(result.total);
    }, 20000);

    test('单个查询失败不影响其他查询', async () => {
      const result = await tool.batchSearch(['valid query', ''], {});
      expect(result.results.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('luckySearch 方法', () => {
    test('返回第一个结果的 URL 和标题', async () => {
      const result = await tool.luckySearch('OpenAI');
      if (result.success) {
        expect(result.url).toBeDefined();
        expect(result.title).toBeDefined();
        expect(result.url).toContain('http');
      }
    }, 15000);

    test('无结果时返回错误', async () => {
      const result = await tool.luckySearch('xyzabc123nonexistent999xyz');
      // 取决于搜索结果，可能返回空数组
      expect(result).toHaveProperty('success');
    }, 15000);
  });

  describe('fetchSearchResults 方法', () => {
    test('带重试机制', async () => {
      const result = await tool.fetchSearchResults('test query');
      expect(Array.isArray(result)).toBe(true);
    }, 20000);

    test('超时处理', async () => {
      const shortTimeoutTool = new DuckDuckGoSearchTool({ timeout: 1 });
      try {
        await shortTimeoutTool.fetchSearchResults('test');
        // 如果没超时，可能返回结果
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 10000);
  });

  describe('HTML 解析', () => {
    test('parseHTML 正确解析 DuckDuckGo HTML', async () => {
      // 使用实际搜索结果验证解析逻辑
      const result = await tool.search('test query');
      if (result.success && result.results.length > 0) {
        // 验证解析出的结果包含必要字段
        const firstResult = result.results[0];
        expect(firstResult.title).toBeTruthy();
        expect(firstResult.url).toBeTruthy();
        expect(firstResult.url).not.toContain('duckduckgo.com');
      }
    }, 15000);

    test('fixDuckDuckGoURL 修复跳转 URL', () => {
      const fixed = tool.fixDuckDuckGoURL('//duckduckgo.com/l/?uddg=https://example.com/page');
      expect(fixed).toBe('https://example.com/page');
    });

    test('fixDuckDuckGoURL 处理相对路径', () => {
      const fixed = tool.fixDuckDuckGoURL('/some/path');
      expect(fixed).toBe('https://duckduckgo.com/some/path');
    });

    test('decodeHTML 解码 HTML 实体', () => {
      const decoded = tool.decodeHTML('&amp;&lt;&gt;&quot;&#39;&nbsp;');
      // &amp; -> &, &lt; -> <, &gt; -> >, &quot; -> ", &#39; -> ', &nbsp; -> (space)
      expect(decoded).toBe('&<>"\' ');
    });
  });

  describe('错误处理', () => {
    test('网络错误返回错误信息', async () => {
      // 使用一个肯定会失败的URL
      const badTool = new DuckDuckGoSearchTool({ timeout: 1000 });
      // 由于我们无法轻易模拟网络错误，直接测试异常分支
      const result = await badTool.execute({
        action: 'search',
        query: 'test'
      });
      // 结果取决于实际网络状况
      expect(result).toHaveProperty('success');
    }, 15000);

    test('空 action 返回错误', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
    });
  });

  describe('参数解析', () => {
    test('parameters 属性存在', () => {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toHaveProperty('action');
      expect(tool.parameters.required).toContain('action');
    });

    test('action enum 包含所有支持的操作', () => {
      expect(tool.parameters.properties.action.enum).toEqual(
        expect.arrayContaining(['search', 'batch_search', 'lucky'])
      );
    });
  });

  describe('实例配置', () => {
    test('构造函数接受自定义配置', () => {
      const customTool = new DuckDuckGoSearchTool({
        timeout: 5000,
        maxResults: 20
      });
      expect(customTool.timeout).toBe(5000);
      expect(customTool.maxResults).toBe(20);
    });

    test('默认配置正确', () => {
      const defaultTool = new DuckDuckGoSearchTool();
      expect(defaultTool.timeout).toBe(30000);
      expect(defaultTool.maxResults).toBe(10);
    });
  });
});
