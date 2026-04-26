/**
 * 综合测试运行器
 * 统一运行所有综合测试用例
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('\n========================================');
console.log('AI Chat 项目 - 综合测试运行器');
console.log('========================================\n');

const tests = [
  {
    name: 'API 端点测试',
    file: '综合测试_API端点.test.js',
    description: '测试核心 API 端点的功能与错误处理'
  },
  {
    name: 'RAG 检索与向量处理测试',
    file: '综合测试_RAG检索与向量处理.test.js',
    description: '测试检索增强生成的核心组件'
  },
  {
    name: '工具执行系统测试',
    file: '综合测试_工具执行系统.test.js',
    description: '测试工具注册、执行、参数验证和超时控制'
  },
  {
    name: 'SSE 流式响应测试',
    file: '综合测试_SSE流式响应.test.js',
    description: '测试 Server-Sent Events 流式输出'
  }
];

const results = [];
let totalPassed = 0;
let totalFailed = 0;

/**
 * 运行单个测试文件
 */
function runTest(test) {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, test.file);
    console.log(`\n----------------------------------------`);
    console.log(`▶ 正在运行: ${test.name}`);
    console.log(`  文件: ${test.file}`);
    console.log(`  说明: ${test.description}`);
    console.log(`----------------------------------------`);

    const child = spawn('node', [testPath], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      const passed = code === 0;
      results.push({
        name: test.name,
        passed,
        exitCode: code
      });

      if (passed) {
        totalPassed++;
        console.log(`\n✅ ${test.name} - 通过`);
      } else {
        totalFailed++;
        console.log(`\n❌ ${test.name} - 失败 (退出码: ${code})`);
      }

      resolve();
    });

    child.on('error', (err) => {
      results.push({
        name: test.name,
        passed: false,
        error: err.message
      });
      totalFailed++;
      console.log(`\n❌ ${test.name} - 错误: ${err.message}`);
      resolve();
    });
  });
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log(`\n共 ${tests.length} 个测试文件待运行\n`);

  for (const test of tests) {
    await runTest(test);
    // 间隔一段时间，避免资源竞争
    await new Promise(r => setTimeout(r, 500));
  }

  // 输出汇总
  console.log('\n========================================');
  console.log('测试汇总');
  console.log('========================================\n');

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    const detail = result.passed ? '通过' : `失败 (${result.exitCode || result.error})`;
    console.log(`${status} ${result.name}: ${detail}`);
  }

  console.log('\n----------------------------------------');
  console.log(`总计: ${totalPassed} 通过, ${totalFailed} 失败`);
  console.log('----------------------------------------\n');

  return { totalPassed, totalFailed };
}

// 运行测试
runAllTests()
  .then(({ totalPassed, totalFailed }) => {
    if (totalFailed > 0) {
      console.log('⚠️  部分测试失败，请检查上述输出\n');
      process.exit(1);
    } else {
      console.log('🎉 所有测试通过！\n');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('测试运行器出错:', err);
    process.exit(1);
  });
