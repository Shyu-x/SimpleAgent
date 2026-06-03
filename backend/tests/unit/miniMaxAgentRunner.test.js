/**
 * miniMaxAgentRunner.initMessages() 修复测试
 *
 * 修复前 BUG: run() 调用 initMessages() 会清空 addUserMessage 添加的内容
 * 修复后: initMessages() 检查 messages[0] 已是 system 时不重置
 */

const assert = require('assert');

describe('miniMaxAgentRunner.initMessages() 修复', () => {
  let runner;
  const { MiniMaxAgentRunner } = require('../../src/services/miniMaxAgentRunner.js');

  beforeEach(() => {
    runner = new MiniMaxAgentRunner({});
    // 模拟 run() 入口: 先 initMessages
    runner.initMessages();
  });

  it('首次 initMessages 应设置 system prompt', () => {
    assert.ok(runner.messages);
    assert.strictEqual(runner.messages.length, 1);
    assert.strictEqual(runner.messages[0].role, 'system');
  });

  it('已有 system + user 时再调用 initMessages 不应清空 user', () => {
    runner.addUserMessage('用户问题');
    assert.strictEqual(runner.messages.length, 2);
    assert.strictEqual(runner.messages[1].role, 'user');
    assert.strictEqual(runner.messages[1].content, '用户问题');

    // 再次 initMessages (run 入口)
    runner.initMessages();

    // user 必须保留
    assert.strictEqual(runner.messages.length, 2);
    assert.strictEqual(runner.messages[0].role, 'system');
    assert.strictEqual(runner.messages[1].role, 'user');
    assert.strictEqual(runner.messages[1].content, '用户问题');
  });

  it('addUserMessage 先于 run/initMessages (route 调用顺序)', () => {
    // 模拟: route 先 addUserMessage, 然后 run 调 initMessages
    const fresh = new MiniMaxAgentRunner({});
    fresh.addUserMessage('Q1');
    fresh.addUserMessage('Q2');
    assert.strictEqual(fresh.messages.length, 2, 'addUserMessage 后应为 2 条 user');

    // 现在 run 入口调 initMessages
    fresh.initMessages();

    // 必须: system 在前, 2 条 user 在后
    assert.strictEqual(fresh.messages.length, 3, 'initMessages 后应为 3 条 (1 system + 2 user)');
    assert.strictEqual(fresh.messages[0].role, 'system');
    assert.strictEqual(fresh.messages[1].content, 'Q1');
    assert.strictEqual(fresh.messages[2].content, 'Q2');
  });

  it('空 messages 数组时 initMessages 创建 system', () => {
    runner.messages = [];
    runner.initMessages();
    assert.strictEqual(runner.messages.length, 1);
    assert.strictEqual(runner.messages[0].role, 'system');
  });
});
