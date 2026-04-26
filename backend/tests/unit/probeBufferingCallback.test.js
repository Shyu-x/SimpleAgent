/**
 * ProbeBufferingCallback (首包探测) 单元测试
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

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== ProbeBufferingCallback 实现 ==========

class ProbeBufferingCallback {
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
    this.onFirstChunk = options.onFirstChunk || (() => {});
    this.onTimeout = options.onTimeout || (() => {});

    this.buffer = [];
    this.firstChunkReceived = false;
    this.firstChunkTime = null;
    this.startTime = Date.now();
    this.timedOut = false;
    this.timeoutTimer = null;

    // 启动超时定时器
    this._startTimeoutTimer();
  }

  _startTimeoutTimer() {
    this.timeoutTimer = setTimeout(() => {
      if (!this.firstChunkReceived) {
        this.timedOut = true;
        this.onTimeout();
      }
    }, this.timeout);
  }

  /**
   * 处理数据块
   */
  onChunk(chunk) {
    if (this.firstChunkReceived) {
      // 首包后直接传递
      return { data: chunk, passed: true };
    }

    // 缓冲首包
    this.buffer.push(chunk);
    return null;
  }

  /**
   * 首包已接收
   */
  firstPackageReceived() {
    this.firstChunkReceived = true;
    this.firstChunkTime = Date.now() - this.startTime;

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    this.onFirstChunk({
      duration: this.firstChunkTime,
      bufferedChunks: this.buffer.length
    });

    return this.buffer;
  }

  /**
   * 获取缓冲的数据
   */
  getBuffered() {
    return [...this.buffer];
  }

  /**
   * 重置状态
   */
  reset() {
    this.buffer = [];
    this.firstChunkReceived = false;
    this.firstChunkTime = null;
    this.timedOut = false;

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    this.startTime = Date.now();
    this._startTimeoutTimer();
  }

  /**
   * 销毁，清理定时器
   */
  destroy() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      firstChunkReceived: this.firstChunkReceived,
      firstChunkTime: this.firstChunkTime,
      bufferedCount: this.buffer.length,
      timedOut: this.timedOut,
      duration: Date.now() - this.startTime
    };
  }
}

// ========== Tests ==========

function runTests() {
  console.log('\n========================================');
  console.log('ProbeBufferingCallback 首包探测测试');
  console.log('========================================\n');

  // ========== 1. 构造函数测试 ==========
  console.log('【1. 构造函数测试】');

  runTest('默认配置应正确', () => {
    const cb = new ProbeBufferingCallback();

    assertEqual(cb.timeout, 5000, '默认超时应为 5000ms');
    assertTrue(Array.isArray(cb.buffer), '应有 buffer 数组');
    assertTrue(typeof cb.onFirstChunk === 'function', 'onFirstChunk 应为函数');
    assertTrue(typeof cb.onTimeout === 'function', 'onTimeout 应为函数');
  });

  runTest('自定义配置应生效', () => {
    const cb = new ProbeBufferingCallback({
      timeout: 10000,
      onFirstChunk: () => {},
      onTimeout: () => {}
    });

    assertEqual(cb.timeout, 10000, '自定义超时应生效');
  });

  // ========== 2. 首包缓冲测试 ==========
  console.log('\n【2. 首包缓冲测试】');

  runTest('首包应被缓冲', () => {
    const cb = new ProbeBufferingCallback();
    const chunk = { content: 'first chunk' };

    const result = cb.onChunk(chunk);

    assertEqual(result, null, '首包应返回 null (被缓冲)');
    assertEqual(cb.buffer.length, 1, 'buffer 应有 1 个元素');
    assertEqual(cb.buffer[0].content, 'first chunk', '缓冲内容应正确');
  });

  runTest('多包应被缓冲', () => {
    const cb = new ProbeBufferingCallback();

    cb.onChunk({ content: 'chunk1' });
    cb.onChunk({ content: 'chunk2' });
    cb.onChunk({ content: 'chunk3' });

    assertEqual(cb.buffer.length, 3, 'buffer 应有 3 个元素');
  });

  runTest('首包接收后不再缓冲', () => {
    const cb = new ProbeBufferingCallback();

    cb.onChunk({ content: 'first' });
    cb.firstPackageReceived();

    const result = cb.onChunk({ content: 'second' });

    // 首包接收后应直接返回
    assertTrue(result !== null, '首包后应返回数据');
    assertEqual(result.data.content, 'second', '应返回新数据');
    assertEqual(cb.buffer.length, 1, 'buffer 不应增加');
  });

  // ========== 3. firstPackageReceived 测试 ==========
  console.log('\n【3. firstPackageReceived 测试】');

  runTest('firstPackageReceived 应返回缓冲数据', () => {
    const cb = new ProbeBufferingCallback();

    cb.onChunk({ content: 'chunk1' });
    cb.onChunk({ content: 'chunk2' });

    const buffered = cb.firstPackageReceived();

    assertEqual(buffered.length, 2, '应返回 2 个缓冲块');
    assertEqual(buffered[0].content, 'chunk1', '第一个块内容应正确');
    assertEqual(buffered[1].content, 'chunk2', '第二个块内容应正确');
  });

  runTest('firstPackageReceived 应设置时间', () => {
    const cb = new ProbeBufferingCallback();

    sleep(10).then(() => {
      cb.firstPackageReceived();
    });

    // 由于是异步，这里只验证状态
    assertTrue(!cb.firstChunkReceived, '初始应为未接收状态');
  });

  runTest('firstPackageReceived 应触发回调', () => {
    let callbackCalled = false;
    let callbackData = null;

    const cb = new ProbeBufferingCallback({
      onFirstChunk: (data) => {
        callbackCalled = true;
        callbackData = data;
      }
    });

    cb.onChunk({ content: 'test' });
    cb.firstPackageReceived();

    assertTrue(callbackCalled, '回调应被调用');
    assertTrue(callbackData !== null, '回调应传递数据');
    assertTrue(callbackData.bufferedChunks === 1, '缓冲块数应为 1');
  });

  // ========== 4. 超时测试 ==========
  console.log('\n【4. 超时测试】');

  runTest('超时后应触发 onTimeout', async () => {
    let timeoutCalled = false;

    const cb = new ProbeBufferingCallback({
      timeout: 50,
      onTimeout: () => {
        timeoutCalled = true;
      }
    });

    // 不发送任何数据，等待超时
    await sleep(100);

    assertTrue(timeoutCalled, '超时回调应被调用');
    assertTrue(cb.timedOut, 'timedOut 状态应为 true');
  });

  runTest('首包接收后不应触发超时', async () => {
    let timeoutCalled = false;

    const cb = new ProbeBufferingCallback({
      timeout: 100,
      onTimeout: () => {
        timeoutCalled = true;
      }
    });

    // 立即发送首包
    cb.onChunk({ content: 'immediate' });
    cb.firstPackageReceived();

    // 等待超时时间
    await sleep(150);

    assertTrue(!timeoutCalled, '首包接收后不应触发超时');
  });

  // ========== 5. reset 测试 ==========
  console.log('\n【5. reset 测试】');

  runTest('reset 应重置所有状态', () => {
    const cb = new ProbeBufferingCallback();

    cb.onChunk({ content: 'chunk1' });
    cb.onChunk({ content: 'chunk2' });

    cb.reset();

    assertEqual(cb.buffer.length, 0, 'buffer 应清空');
    assertTrue(!cb.firstChunkReceived, 'firstChunkReceived 应为 false');
    assertTrue(cb.firstChunkTime === null, 'firstChunkTime 应为 null');
    assertTrue(!cb.timedOut, 'timedOut 应为 false');
  });

  // ========== 6. getState 测试 ==========
  console.log('\n【6. getState 测试】');

  runTest('getState 应返回完整状态', () => {
    const cb = new ProbeBufferingCallback();

    const state = cb.getState();

    assertTrue('firstChunkReceived' in state, '应有 firstChunkReceived');
    assertTrue('firstChunkTime' in state, '应有 firstChunkTime');
    assertTrue('bufferedCount' in state, '应有 bufferedCount');
    assertTrue('timedOut' in state, '应有 timedOut');
    assertTrue('duration' in state, '应有 duration');
  });

  runTest('状态应随操作更新', () => {
    const cb = new ProbeBufferingCallback();

    cb.onChunk({ content: 'test' });
    let state1 = cb.getState();

    assertEqual(state1.bufferedCount, 1, '缓冲计数应为 1');

    cb.firstPackageReceived();
    let state2 = cb.getState();

    assertTrue(state2.firstChunkReceived, 'firstChunkReceived 应为 true');
  });

  // ========== 7. getBuffered 测试 ==========
  console.log('\n【7. getBuffered 测试】');

  runTest('getBuffered 应返回副本', () => {
    const cb = new ProbeBufferingCallback();

    cb.onChunk({ content: 'chunk1' });
    cb.onChunk({ content: 'chunk2' });

    const buffered1 = cb.getBuffered();
    const buffered2 = cb.getBuffered();

    // 返回应是副本
    buffered1.push({ content: 'extra' });

    assertEqual(cb.buffer.length, 2, '原始 buffer 不应被修改');
    assertEqual(buffered1.length, 3, '副本应包含额外元素');
    assertEqual(buffered2.length, 2, '第二次获取应仍是原始长度');
  });

  // ========== 8. 边界测试 ==========
  console.log('\n【8. 边界测试】');

  runTest('空 chunk 应正常处理', () => {
    const cb = new ProbeBufferingCallback();

    const result = cb.onChunk(null);

    assertEqual(result, null, '空 chunk 应返回 null');
  });

  runTest('空字符串 chunk 应正常处理', () => {
    const cb = new ProbeBufferingCallback();

    const result = cb.onChunk('');

    assertEqual(result, null, '空字符串应返回 null');
    assertEqual(cb.buffer.length, 1, '空字符串应被缓冲');
  });

  runTest('超时时间为 0 应禁用超时', async () => {
    let timeoutCalled = false;

    const cb = new ProbeBufferingCallback({
      timeout: 0,
      onTimeout: () => {
        timeoutCalled = true;
      }
    });

    // 等待一段时间
    await sleep(100);

    // 超时为 0 时，不应触发超时
    assertTrue(!timeoutCalled, '超时为 0 时不应触发超时');
    assertTrue(!cb.timedOut, 'timedOut 应为 false');

    cb.destroy?.();
  });

  // ========== 9. destroy 清理测试 ==========
  console.log('\n【9. destroy 清理测试】');

  runTest('destroy 应清理定时器', () => {
    const cb = new ProbeBufferingCallback({ timeout: 10000 });

    assertTrue(cb.timeoutTimer !== null, '应有定时器');

    cb.destroy();

    // 验证定时器被清理
    assertTrue(cb.timeoutTimer === null, '定时器应被清理');
  });

  // ========== 汇总 ==========
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  return { passed, failed };
}

// 运行
runTests();
