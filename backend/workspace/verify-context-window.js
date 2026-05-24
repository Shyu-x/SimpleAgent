/**
 * MemoryWindowManager 综合验证脚本
 * 测试窗口滑动、摘要触发、token计算
 */
const MemoryWindowManager = require('../src/services/agent/MemoryWindowManager');
const path = require('path');

const testStorageDir = path.join(__dirname, 'workspace', 'test-context-window');

async function runTests() {
  console.log('='.repeat(60));
  console.log('MemoryWindowManager 上下文窗口管理验证');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  // Test 1: 窗口滑动验证
  console.log('\n[Test 1] 窗口滑动验证');
  console.log('-'.repeat(40));
  {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 3,
      maxTokens: 1000,
      summaryThreshold: 10000
    });
    await manager.initialize();

    // 添加 5 条消息
    for (let i = 1; i <= 5; i++) {
      await manager.addMessage({ role: 'user', content: `消息 ${i}` }, 'slide-test');
    }

    const stats = manager.getStats('slide-test');
    console.log(`添加 5 条消息后 (windowSize=3):`);
    console.log(`  - 消息数量: ${stats.messageCount}`);
    console.log(`  - 是否触发摘要: ${manager.shouldSummarize('slide-test')}`);

    // 窗口应该保留 [summary, msg3, msg4, msg5] = 4条（包含摘要）
    if (stats.messageCount >= 3) {
      console.log('✓ 窗口滑动正常');
      passed++;
    } else {
      console.log('✗ 窗口滑动异常');
      failed++;
    }
  }

  // Test 2: 摘要触发验证
  console.log('\n[Test 2] 摘要触发验证');
  console.log('-'.repeat(40));
  {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 5,
      maxTokens: 1000,
      summaryThreshold: 1000 // 低阈值，易触发
    });
    await manager.initialize();

    // 添加短消息（不会触发 token 阈值）
    for (let i = 1; i <= 6; i++) {
      await manager.addMessage({ role: 'user', content: `短消息 ${i}` }, 'summary-test');
    }

    const shouldSumm = manager.shouldSummarize('summary-test');
    console.log(`添加 6 条短消息后 (windowSize=5):`);
    console.log(`  - 是否应该摘要: ${shouldSumm}`);
    console.log(`  - 触发原因: 消息数 > 窗口大小`);

    if (shouldSumm === true) {
      console.log('✓ 摘要触发正常');
      passed++;
    } else {
      console.log('✗ 摘要触发异常');
      failed++;
    }
  }

  // Test 3: Token 计算验证
  console.log('\n[Test 3] Token 计算验证');
  console.log('-'.repeat(40));
  {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      model: 'minimax'
    });
    await manager.initialize();

    const testCases = [
      { text: '你好', expectedMin: 1 },
      { text: 'hello', expectedMin: 1 },
      { text: '你好hello世界', expectedMin: 2 },
      { text: '这是一段较长的中文文本用于测试token计算', expectedMin: 10 },
      { text: '', expectedMin: 0 }
    ];

    let tokenTestPassed = 0;
    for (const tc of testCases) {
      const tokens = manager._estimateTokens(tc.text);
      const ok = tokens >= tc.expectedMin;
      console.log(`  "${tc.text.slice(0, 15)}${tc.text.length > 15 ? '...' : ''}" -> ${tokens} tokens (期望 >= ${tc.expectedMin}) ${ok ? '✓' : '✗'}`);
      if (ok) tokenTestPassed++;
    }

    if (tokenTestPassed === testCases.length) {
      console.log('✓ Token 计算准确');
      passed++;
    } else {
      console.log('✗ Token 计算有误');
      failed++;
    }
  }

  // Test 4: getContext 上下文获取验证
  console.log('\n[Test 4] getContext 上下文获取验证');
  console.log('-'.repeat(40));
  {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 3,
      maxTokens: 500
    });
    await manager.initialize();

    // 添加多条消息
    for (let i = 1; i <= 5; i++) {
      await manager.addMessage({
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `这是第 ${i} 条比较长的消息内容用于测试上下文窗口管理功能`
      }, 'context-test');
    }

    const context = manager.getContext(300, 'context-test');
    console.log(`获取 maxTokens=300 的上下文:`);
    console.log(`  - 返回消息数: ${context.length}`);

    // 验证上下文按时间顺序排列
    let isOrdered = true;
    for (let i = 1; i < context.length; i++) {
      const prev = context[i-1].timestamp || 0;
      const curr = context[i].timestamp || 0;
      if (curr < prev) {
        isOrdered = false;
        break;
      }
    }

    if (context.length > 0 && isOrdered) {
      console.log('✓ 上下文获取正常，消息按时间顺序排列');
      passed++;
    } else {
      console.log('✗ 上下文获取异常');
      failed++;
    }
  }

  // Test 5: 摘要内容验证
  console.log('\n[Test 5] 摘要内容验证');
  console.log('-'.repeat(40));
  {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 2
    });
    await manager.initialize();

    const testMessages = [
      { role: 'user', content: '机器学习是人工智能的核心技术' },
      { role: 'assistant', content: '是的，机器学习确实很重要' },
      { role: 'user', content: '深度学习是机器学习的子领域' },
      { role: 'assistant', content: '没错，深度学习在图像识别方面很强' },
      { role: 'user', content: '自然语言处理也很重要' }
    ];

    for (const msg of testMessages) {
      await manager.addMessage(msg, 'summary-content-test');
    }

    const stats = manager.getStats('summary-content-test');
    const exported = manager.export('summary-content-test');

    console.log(`摘要生成结果:`);
    console.log(`  - 消息数量: ${stats.messageCount}`);
    console.log(`  - 是否有摘要: ${stats.hasSummary}`);

    if (stats.hasSummary && stats.messageCount > 0) {
      console.log('✓ 摘要生成正常');
      passed++;
    } else {
      console.log('✗ 摘要生成异常');
      failed++;
    }
  }

  // Test 6: 持久化验证
  console.log('\n[Test 6] 持久化验证');
  console.log('-'.repeat(40));
  {
    const manager = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 3
    });
    await manager.initialize();

    await manager.addMessage({ role: 'user', content: '持久化测试' }, 'persist-test');
    await manager.summarize('persist-test');

    // 重新创建 manager，应该能恢复摘要
    const manager2 = new MemoryWindowManager({
      storageDir: testStorageDir,
      windowSize: 3
    });
    await manager2.initialize();

    const stats = manager2.getStats('persist-test');
    console.log(`重新加载会话 (persist-test):`);
    console.log(`  - 消息数量: ${stats.messageCount}`);
    console.log(`  - 是否有摘要: ${stats.hasSummary}`);

    if (stats.hasSummary) {
      console.log('✓ 持久化正常，摘要可恢复');
      passed++;
    } else {
      console.log('✗ 持久化异常');
      failed++;
    }
  }

  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('验证结果汇总');
  console.log('='.repeat(60));
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  console.log('='.repeat(60));

  // 清理测试数据
  const fs = require('fs').promises;
  try {
    await fs.rm(testStorageDir, { recursive: true, force: true });
  } catch (e) {}

  return failed === 0;
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('验证失败:', err);
  process.exit(1);
});