/**
 * AI Chat 玩具 - 测试启动器
 *
 * 使用方法:
 *   node run-tests.js              # 运行所有测试
 *   node run-tests.js --headed     # 显示浏览器
 *   node run-tests.js --mobile     # 移动端测试
 *   node run-tests.js --ui        # UI 模式
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const isWindows = process.platform === 'win32';

async function main() {
  console.log('🤖 AI Chat 玩具 - 测试启动器\n');

  // 检查是否需要安装 Playwright
  console.log('📦 检查依赖...');

  // 确定测试方式
  let testCommand;
  let testArgs;

  if (args.includes('--playwright')) {
    // 使用 Playwright Test
    testCommand = isWindows ? 'npx.cmd' : 'npx';
    testArgs = ['playwright', 'test', ...args.filter(a => a !== '--playwright')];

    if (args.includes('--headed')) {
      testArgs.push('--headed');
    }
    if (args.includes('--ui')) {
      testArgs.push('--ui');
    }
    if (args.includes('--mobile')) {
      testArgs.push('--project=Mobile');
    }
  } else {
    // 使用自定义测试运行器
    testCommand = isWindows ? 'node.cmd' : 'node';
    testArgs = [
      path.join(__dirname, 'full-interface-test.js'),
      ...args
    ];
  }

  console.log(`🚀 运行命令: ${testCommand} ${testArgs.join(' ')}\n`);

  // 启动测试
  const child = spawn(testCommand, testArgs, {
    cwd: __dirname,
    stdio: 'inherit',
    shell: isWindows,
  });

  child.on('error', (error) => {
    console.error('❌ 测试启动失败:', error);
    process.exit(1);
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ 测试完成!');
    } else {
      console.log(`\n❌ 测试失败，退出码: ${code}`);
    }
    process.exit(code);
  });
}

main().catch(console.error);
