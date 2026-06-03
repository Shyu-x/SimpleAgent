/**
 * B4 TOOL-1: 工具声明注入单元测试
 *
 * 验证 sseService.injectToolDeclarations 的行为：
 * 1. 第一条是 system 时，追加 TOOL_SYSPROMPT
 * 2. 第一条不是 system 时，插入 system
 * 3. 不修改原 messages（不可变）
 */
const assert = require('assert');
const SSEService = require('../../src/services/sseService');

const { injectToolDeclarations, TOOL_SYSPROMPT } = SSEService;

describe('B4 TOOL-1: injectToolDeclarations 工具声明注入', () => {
  test('无 system 时应在头部插入 system 并包含工具声明', () => {
    const messages = [
      { role: 'user', content: '计算 1+1' }
    ];
    const result = injectToolDeclarations(messages);
    assert.strictEqual(result.length, 2, '应多出一条 system');
    assert.strictEqual(result[0].role, 'system', '第一条应为 system');
    assert.ok(result[0].content.includes('get_current_time'), 'system 应包含 get_current_time');
    assert.ok(result[0].content.includes('calculator'), 'system 应包含 calculator');
    assert.ok(result[0].content.includes('<<<TOOL:'), 'system 应包含协议标记');
    assert.strictEqual(result[1].role, 'user', 'user 消息应在 system 之后');
    assert.strictEqual(result[1].content, '计算 1+1', 'user 消息内容不变');
  });

  test('已有 system 时应追加工具声明而非覆盖', () => {
    const messages = [
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '现在几点' }
    ];
    const result = injectToolDeclarations(messages);
    assert.strictEqual(result.length, 2, '消息数不变');
    assert.ok(result[0].content.startsWith('你是助手'), '原 system 文本应保留在头部');
    assert.ok(result[0].content.includes('web_search'), '应追加工具声明');
    assert.ok(result[0].content.includes('get_current_time'), '应包含 get_current_time');
  });

  test('第一条是 assistant 时应在头部插入 system', () => {
    const messages = [
      { role: 'assistant', content: '你好' },
      { role: 'user', content: '计算 2*3' }
    ];
    const result = injectToolDeclarations(messages);
    assert.strictEqual(result.length, 3, '应插入一条 system');
    assert.strictEqual(result[0].role, 'system', '头部应为 system');
    assert.ok(result[0].content.includes('calculator'), '应包含 calculator');
    assert.strictEqual(result[1].role, 'assistant', '原 assistant 应在 system 之后');
    assert.strictEqual(result[2].role, 'user', 'user 消息保持');
  });

  test('不应修改原 messages（不可变）', () => {
    const messages = [
      { role: 'user', content: 'test' }
    ];
    const before = JSON.stringify(messages);
    injectToolDeclarations(messages);
    const after = JSON.stringify(messages);
    assert.strictEqual(before, after, '原 messages 不应被修改');
  });

  test('空数组应返回仅含 system 的结果', () => {
    const result = injectToolDeclarations([]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].role, 'system');
  });

  test('多模态消息（content 为数组）应保持原状', () => {
    const messages = [
      { role: 'user', content: [
        { type: 'text', text: '描述这张图' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } }
      ]}
    ];
    const result = injectToolDeclarations(messages);
    assert.strictEqual(result.length, 2);
    assert.ok(Array.isArray(result[1].content), '多模态数组应保持');
  });

  test('TOOL_SYSPROMPT 导出内容应至少包含 4 个工具名', () => {
    assert.ok(TOOL_SYSPROMPT.includes('get_current_time'));
    assert.ok(TOOL_SYSPROMPT.includes('web_search'));
    assert.ok(TOOL_SYSPROMPT.includes('calculator'));
    assert.ok(TOOL_SYSPROMPT.includes('knowledge_base_search'));
  });
});
