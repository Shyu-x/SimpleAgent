/**
 * DateTimeTool 集成测试
 * 测试文件: src/services/tools/dateTimeTool.js
 */

const DateTimeTool = require('../../src/services/tools/dateTimeTool');

describe('DateTimeTool 集成测试', () => {
  let tool;

  beforeEach(() => {
    tool = new DateTimeTool();
  });

  describe('execute 方法 - now 操作', () => {
    test('获取当前时间', async () => {
      const result = await tool.execute({ operation: 'now' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('iso');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('year');
      expect(result.data).toHaveProperty('month');
      expect(result.data).toHaveProperty('day');
      expect(result.data).toHaveProperty('weekday');
      expect(typeof result.data.timestamp).toBe('number');
    });

    test('指定时区获取当前时间', async () => {
      const result = await tool.execute({
        operation: 'now',
        options: { timezone: 'America/New_York' }
      });
      expect(result.success).toBe(true);
      expect(result.data.timezone).toBe('America/New_York');
    });
  });

  describe('execute 方法 - format 操作', () => {
    test('格式化日期时间', async () => {
      const result = await tool.execute({
        operation: 'format',
        datetime: '2026-03-21T10:30:00Z',
        options: { format: 'YYYY-MM-DD' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toContain('2026-03-21');
    });

    test('格式化带时间', async () => {
      const result = await tool.execute({
        operation: 'format',
        datetime: '2026-03-21T10:30:00Z',
        options: { format: 'YYYY-MM-DD HH:mm:ss' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toMatch(/2026-03-21 \d{2}:\d{2}:\d{2}/);
    });

    test('无效日期格式化应返回错误', async () => {
      const result = await tool.execute({
        operation: 'format',
        datetime: 'invalid-date',
        options: { format: 'YYYY-MM-DD' }
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的日期时间');
    });
  });

  describe('execute 方法 - parse 操作', () => {
    test('解析 ISO 日期字符串', async () => {
      const result = await tool.execute({
        operation: 'parse',
        datetime: '2026-03-21T10:30:00Z'
      });
      expect(result.success).toBe(true);
      expect(result.data.year).toBe(2026);
      expect(result.data.month).toBe(3);
      expect(result.data.day).toBe(21);
    });

    test('解析无效日期应返回错误', async () => {
      const result = await tool.execute({
        operation: 'parse',
        datetime: 'not-a-date'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('无法解析');
    });
  });

  describe('execute 方法 - add 操作', () => {
    test('添加天数', async () => {
      const result = await tool.execute({
        operation: 'add',
        datetime: '2026-03-21T10:00:00Z',
        options: { unit: 'day', value: 5 }
      });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('+5 day');
    });

    test('添加小时', async () => {
      const result = await tool.execute({
        operation: 'add',
        datetime: '2026-03-21T10:00:00Z',
        options: { unit: 'hour', value: 3 }
      });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('+3 hour');
    });

    test('添加月', async () => {
      const result = await tool.execute({
        operation: 'add',
        datetime: '2026-03-21T10:00:00Z',
        options: { unit: 'month', value: 1 }
      });
      expect(result.success).toBe(true);
    });
  });

  describe('execute 方法 - subtract 操作', () => {
    test('减去天数', async () => {
      const result = await tool.execute({
        operation: 'subtract',
        datetime: '2026-03-21T10:00:00Z',
        options: { unit: 'day', value: 3 }
      });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('-3 day');
    });

    test('减去年', async () => {
      const result = await tool.execute({
        operation: 'subtract',
        datetime: '2026-03-21T10:00:00Z',
        options: { unit: 'year', value: 1 }
      });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('-1 year');
    });
  });

  describe('execute 方法 - diff 操作', () => {
    test('计算天数差', async () => {
      const result = await tool.execute({
        operation: 'diff',
        datetime: '2026-03-01T00:00:00Z',
        options: {
          targetDatetime: '2026-03-21T00:00:00Z',
          unit: 'day'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.value).toBe(20);
      expect(result.data.unit).toBe('day');
    });

    test('计算小时差', async () => {
      const result = await tool.execute({
        operation: 'diff',
        datetime: '2026-03-21T10:00:00Z',
        options: {
          targetDatetime: '2026-03-21T15:00:00Z',
          unit: 'hour'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.value).toBe(5);
      expect(result.data.unit).toBe('hour');
    });

    test('计算分钟差', async () => {
      const result = await tool.execute({
        operation: 'diff',
        datetime: '2026-03-21T10:00:00Z',
        options: {
          targetDatetime: '2026-03-21T10:30:00Z',
          unit: 'minute'
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.value).toBe(30);
    });
  });

  describe('execute 方法 - start_of 操作', () => {
    test('一天的开始', async () => {
      const result = await tool.execute({
        operation: 'start_of',
        datetime: '2026-03-21T15:30:00Z',
        options: { unit: 'day' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('iso');
      expect(result.data).toHaveProperty('timestamp');
    });

    test('一月的开始', async () => {
      const result = await tool.execute({
        operation: 'start_of',
        datetime: '2026-03-21T15:30:00Z',
        options: { unit: 'month' }
      });
      expect(result.success).toBe(true);
      expect(result.unit).toBe('month');
    });

    test('一年的开始', async () => {
      const result = await tool.execute({
        operation: 'start_of',
        datetime: '2026-03-21T15:30:00Z',
        options: { unit: 'year' }
      });
      expect(result.success).toBe(true);
      expect(result.unit).toBe('year');
    });
  });

  describe('execute 方法 - end_of 操作', () => {
    test('一天的结束', async () => {
      const result = await tool.execute({
        operation: 'end_of',
        datetime: '2026-03-21T15:30:00Z',
        options: { unit: 'day' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('iso');
    });

    test('一月的结束', async () => {
      const result = await tool.execute({
        operation: 'end_of',
        datetime: '2026-03-21T15:30:00Z',
        options: { unit: 'month' }
      });
      expect(result.success).toBe(true);
      expect(result.unit).toBe('month');
    });
  });

  describe('execute 方法 - is_before 操作', () => {
    test('日期在之前', async () => {
      const result = await tool.execute({
        operation: 'is_before',
        datetime: '2026-03-01T00:00:00Z',
        options: { targetDatetime: '2026-03-21T00:00:00Z' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    test('日期不在之前', async () => {
      const result = await tool.execute({
        operation: 'is_before',
        datetime: '2026-03-31T00:00:00Z',
        options: { targetDatetime: '2026-03-21T00:00:00Z' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe('execute 方法 - is_after 操作', () => {
    test('日期在之后', async () => {
      const result = await tool.execute({
        operation: 'is_after',
        datetime: '2026-03-31T00:00:00Z',
        options: { targetDatetime: '2026-03-21T00:00:00Z' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    test('日期不在之后', async () => {
      const result = await tool.execute({
        operation: 'is_after',
        datetime: '2026-03-01T00:00:00Z',
        options: { targetDatetime: '2026-03-21T00:00:00Z' }
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe('execute 方法 - to_timezone 操作', () => {
    test('转换时区', async () => {
      const result = await tool.execute({
        operation: 'to_timezone',
        datetime: '2026-03-21T10:00:00Z',
        options: { targetTimezone: 'America/New_York' }
      });
      expect(result.success).toBe(true);
      expect(result.data.timezone).toBe('America/New_York');
    });
  });

  describe('execute 方法 - to_timestamp 操作', () => {
    test('转换为时间戳', async () => {
      const result = await tool.execute({
        operation: 'to_timestamp',
        datetime: '2026-03-21T10:00:00Z'
      });
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('number');
    });

    test('无效日期转换应返回错误', async () => {
      const result = await tool.execute({
        operation: 'to_timestamp',
        datetime: 'invalid-date'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('execute 方法 - from_timestamp 操作', () => {
    test('从时间戳转换', async () => {
      const timestamp = 1711015200000; // 2026-03-21T10:00:00Z
      const result = await tool.execute({
        operation: 'from_timestamp',
        datetime: String(timestamp)
      });
      expect(result.success).toBe(true);
      expect(result.data.timestamp).toBe(timestamp);
      expect(result.data).toHaveProperty('iso');
    });

    test('无效时间戳应返回错误', async () => {
      const result = await tool.execute({
        operation: 'from_timestamp',
        datetime: 'invalid-timestamp'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('错误处理', () => {
    test('未知操作应返回错误', async () => {
      const result = await tool.execute({ operation: 'unknown_action' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知操作');
    });

    test('缺少 operation 参数', async () => {
      const result = await tool.execute({});
      expect(result.success).toBe(false);
    });
  });

  describe('参数解析', () => {
    test('parameters 属性存在', () => {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toHaveProperty('operation');
      expect(tool.parameters.required).toContain('operation');
    });

    test('operation enum 包含所有支持的操作', () => {
      const expectedOps = [
        'now', 'format', 'parse', 'add', 'subtract',
        'diff', 'start_of', 'end_of', 'is_before', 'is_after',
        'to_timezone', 'to_timestamp', 'from_timestamp'
      ];
      expect(tool.parameters.properties.operation.enum).toEqual(expect.arrayContaining(expectedOps));
    });
  });
});
