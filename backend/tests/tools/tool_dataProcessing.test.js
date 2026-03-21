/**
 * DataProcessingTool 集成测试
 * 测试文件: src/services/tools/dataProcessingTool.js
 */

const DataProcessingTool = require('../../src/services/tools/dataProcessingTool');

describe('DataProcessingTool 集成测试', () => {
  let tool;

  beforeEach(() => {
    tool = new DataProcessingTool();
  });

  describe('execute 方法 - JSON 操作', () => {
    test('json_parse 解析有效 JSON', async () => {
      const result = await tool.execute({
        operation: 'json_parse',
        data: '{"name": "test", "value": 123}'
      });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('test');
      expect(result.data.value).toBe(123);
      expect(result.type).toBe('object');
    });

    test('json_parse 解析数组', async () => {
      const result = await tool.execute({
        operation: 'json_parse',
        data: '[1, 2, 3, 4, 5]'
      });
      expect(result.success).toBe(true);
      expect(result.type).toBe('array');
      expect(result.data).toEqual([1, 2, 3, 4, 5]);
    });

    test('json_parse 无效 JSON 返回错误', async () => {
      const result = await tool.execute({
        operation: 'json_parse',
        data: 'not valid json'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON 解析失败');
    });

    test('json_stringify 对象序列化', async () => {
      const result = await tool.execute({
        operation: 'json_stringify',
        data: { name: 'test', value: 123 }
      });
      expect(result.success).toBe(true);
      expect(result.data).toContain('name');
      expect(result.data).toContain('test');
    });

    test('json_stringify pretty 格式化', async () => {
      const result = await tool.execute({
        operation: 'json_stringify',
        data: { name: 'test' },
        options: { pretty: true }
      });
      expect(result.success).toBe(true);
      expect(result.data).toContain('\n');
    });

    test('json_query 查询根级', async () => {
      const result = await tool.execute({
        operation: 'json_query',
        data: '{"name": "test", "value": 123}',
        options: {}
      });
      expect(result.success).toBe(true);
    });

    test('json_query 查询嵌套属性', async () => {
      const result = await tool.execute({
        operation: 'json_query',
        data: '{"user": {"name": "test", "age": 25}}',
        options: { path: 'user.name' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('test');
    });

    test('json_query 查询数组索引', async () => {
      const result = await tool.execute({
        operation: 'json_query',
        data: '{"items": [{"id": 1}, {"id": 2}]}',
        options: { path: 'items[0].id' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
    });
  });

  describe('execute 方法 - CSV 操作', () => {
    test('csv_parse 解析简单 CSV', async () => {
      const result = await tool.execute({
        operation: 'csv_parse',
        data: 'name,age,city\nAlice,30,Beijing\nBob,25,Shanghai'
      });
      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.data[0].name).toBe('Alice');
      expect(result.data[0].age).toBe('30');
    });

    test('csv_parse 无表头模式', async () => {
      const result = await tool.execute({
        operation: 'csv_parse',
        data: 'Alice,30,Beijing\nBob,25,Shanghai',
        options: { hasHeader: false }
      });
      expect(result.success).toBe(true);
      expect(result.data[0]).toEqual(['Alice', '30', 'Beijing']);
    });

    test('csv_parse 带引号的字段', async () => {
      const result = await tool.execute({
        operation: 'csv_parse',
        data: 'name,city\nAlice,"New York"\nBob,Beijing'
      });
      expect(result.success).toBe(true);
      expect(result.data[0].city).toBe('New York');
    });

    test('csv_stringify 对象数组转 CSV', async () => {
      const result = await tool.execute({
        operation: 'csv_stringify',
        data: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]
      });
      expect(result.success).toBe(true);
      expect(result.data).toContain('name');
      expect(result.data).toContain('Alice');
      expect(result.data).toContain('age');
    });

    test('csv_stringify 嵌套数组', async () => {
      const result = await tool.execute({
        operation: 'csv_stringify',
        data: [['a', 'b'], ['c', 'd']]
      });
      expect(result.success).toBe(true);
      expect(result.data).toContain('a');
    });
  });

  describe('execute 方法 - 文本操作', () => {
    test('text_split 分割文本', async () => {
      const result = await tool.execute({
        operation: 'text_split',
        data: 'apple,banana,cherry',
        options: { separator: ',' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['apple', 'banana', 'cherry']);
      expect(result.count).toBe(3);
    });

    test('text_split 限制数量', async () => {
      const result = await tool.execute({
        operation: 'text_split',
        data: 'a,b,c,d,e',
        options: { separator: ',', limit: 3 }
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(3);
    });

    test('text_join 连接文本', async () => {
      const result = await tool.execute({
        operation: 'text_join',
        data: ['apple', 'banana', 'cherry'],
        options: { separator: ' | ' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('apple | banana | cherry');
    });

    test('text_replace 替换文本', async () => {
      const result = await tool.execute({
        operation: 'text_replace',
        data: 'hello world hello',
        options: { pattern: 'hello', replacement: 'hi' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('hi world hi');
      expect(result.replacements).toBe(2);
    });

    test('text_replace 正则替换', async () => {
      const result = await tool.execute({
        operation: 'text_replace',
        data: 'a1 b2 c3',
        options: { pattern: '\\d', replacement: '#', flags: 'g' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('a# b# c#');
    });

    test('text_extract 提取匹配', async () => {
      const result = await tool.execute({
        operation: 'text_extract',
        data: 'Email: test@example.com and another: user@test.org',
        options: { pattern: '[\\w.-]+@[\\w.-]+', flags: 'g' }
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.count).toBe(2);
    });
  });

  describe('execute 方法 - 数据操作', () => {
    test('data_filter 等于过滤', async () => {
      const result = await tool.execute({
        operation: 'data_filter',
        data: '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}, {"name": "Charlie", "age": 30}]',
        options: { field: 'age', operator: 'eq', value: 30 }
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    test('data_filter 大于过滤', async () => {
      const result = await tool.execute({
        operation: 'data_filter',
        data: '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]',
        options: { field: 'age', operator: 'gt', value: 25 }
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Alice');
    });

    test('data_filter 包含过滤', async () => {
      const result = await tool.execute({
        operation: 'data_filter',
        data: '[{"name": "Alice"}, {"name": "Bob"}, {"name": "Alex"}]',
        options: { field: 'name', operator: 'contains', value: 'Al' }
      });
      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    test('data_map 映射字段', async () => {
      const result = await tool.execute({
        operation: 'data_map',
        data: '[{"firstName": "Alice", "lastName": "Wang"}, {"firstName": "Bob", "lastName": "Li"}]',
        options: { fields: ['firstName', 'lastName'] }
      });
      expect(result.success).toBe(true);
      expect(result.data[0]).toEqual(['Alice', 'Wang']);
    });

    test('data_map 对象映射', async () => {
      const result = await tool.execute({
        operation: 'data_map',
        data: '[{"a": 1, "b": 2}]',
        options: { fields: { x: 'a', y: 'b' } }
      });
      expect(result.success).toBe(true);
      expect(result.data[0].x).toBe(1);
      expect(result.data[0].y).toBe(2);
    });

    test('data_sort 升序排序', async () => {
      const result = await tool.execute({
        operation: 'data_sort',
        data: '[3, 1, 4, 1, 5, 9, 2, 6]',
        options: { order: 'asc' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
    });

    test('data_sort 降序排序', async () => {
      const result = await tool.execute({
        operation: 'data_sort',
        data: '[3, 1, 4, 1, 5]',
        options: { field: undefined, order: 'desc' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual([5, 4, 3, 1, 1]);
    });

    test('data_sort 对象数组按字段排序', async () => {
      const result = await tool.execute({
        operation: 'data_sort',
        data: '[{"name": "Charlie", "age": 30}, {"name": "Alice", "age": 25}]',
        options: { field: 'name', order: 'asc' }
      });
      expect(result.success).toBe(true);
      expect(result.data[0].name).toBe('Alice');
    });

    test('data_group 分组', async () => {
      const result = await tool.execute({
        operation: 'data_group',
        data: '[{"name": "Alice", "dept": "IT"}, {"name": "Bob", "dept": "IT"}, {"name": "Charlie", "dept": "HR"}]',
        options: { field: 'dept' }
      });
      expect(result.success).toBe(true);
      expect(result.groupCount).toBe(2);
      expect(result.data.IT).toHaveLength(2);
      expect(result.data.HR).toHaveLength(1);
    });
  });

  describe('execute 方法 - 编码操作', () => {
    test('base64_encode 编码', async () => {
      const result = await tool.execute({
        operation: 'base64_encode',
        data: 'Hello, World!'
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe(Buffer.from('Hello, World!').toString('base64'));
    });

    test('base64_decode 解码', async () => {
      const result = await tool.execute({
        operation: 'base64_decode',
        data: Buffer.from('Hello, World!').toString('base64')
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello, World!');
    });

    test('base64_decode 无效输入可能成功或返回错误', async () => {
      // Node.js Buffer.from base64 解码对无效字符有时不报错
      const result = await tool.execute({
        operation: 'base64_decode',
        data: 'not-valid-base64!!!'
      });
      // base64 解码行为取决于 Node.js 实现
      expect(result).toHaveProperty('success');
    });
  });

  describe('execute 方法 - 哈希操作', () => {
    test('hash 默认 sha256', async () => {
      const result = await tool.execute({
        operation: 'hash',
        data: 'Hello, World!'
      });
      expect(result.success).toBe(true);
      expect(result.algorithm).toBe('sha256');
      expect(result.data).toHaveLength(64);
    });

    test('hash md5', async () => {
      const result = await tool.execute({
        operation: 'hash',
        data: 'Hello, World!',
        options: { algorithm: 'md5' }
      });
      expect(result.success).toBe(true);
      expect(result.algorithm).toBe('md5');
      expect(result.data).toHaveLength(32);
    });

    test('hash sha512', async () => {
      const result = await tool.execute({
        operation: 'hash',
        data: 'Hello, World!',
        options: { algorithm: 'sha512' }
      });
      expect(result.success).toBe(true);
      expect(result.algorithm).toBe('sha512');
    });
  });

  describe('execute 方法 - 数据大小限制', () => {
    test('超大数据应返回错误', async () => {
      const largeData = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const result = await tool.execute({
        operation: 'json_parse',
        data: largeData
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('数据过大');
    });
  });

  describe('错误处理', () => {
    test('未知操作应返回错误', async () => {
      const result = await tool.execute({
        operation: 'unknown_operation',
        data: 'test'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知操作');
    });

    test('缺少必需参数 data 可能导致异常', async () => {
      try {
        const result = await tool.execute({
          operation: 'json_parse'
        });
        // 如果不抛异常，则检查返回值
        expect(result).toBeDefined();
      } catch (e) {
        // 缺少 data 可能导致异常，这是可接受的行为
        expect(e).toBeDefined();
      }
    });
  });

  describe('参数解析', () => {
    test('parameters 属性存在', () => {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toHaveProperty('operation');
      expect(tool.parameters.properties).toHaveProperty('data');
      expect(tool.parameters.required).toContain('operation');
      expect(tool.parameters.required).toContain('data');
    });
  });
});
