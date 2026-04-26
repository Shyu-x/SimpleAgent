/**
 * 综合测试运行器
 * 执行所有单元测试、压力测试、集成测试并生成报告
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 测试文件路径 - 相对于 backend/tests 目录
const testFiles = {
  '单元测试': [
    'unit/CircuitBreaker.test.js',
    'unit/SearchChannel.test.js',
    'unit/errors.test.js',
    'unit/TraceService.test.js',
  ],
  '压力测试': [
    'stress/circuitBreakerStress.test.js',
    'stress/searchStress.test.js',
  ],
};

const results = {
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    duration: 0
  },
  modules: {}
};

async function runTest(filePath) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // cwd 是 backend 目录
    const cwd = path.join(__dirname);
    const child = spawn('node', [filePath], {
      cwd: cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;

      // 解析输出
      const passed = (stdout.match(/✅/g) || []).length;
      const failed = (stdout.match(/❌/g) || []).length;

      resolve({
        file: path.basename(filePath),
        code,
        passed,
        failed,
        duration,
        stdout,
        stderr
      });
    });

    child.on('error', (err) => {
      reject({ file: path.basename(filePath), error: err.message });
    });

    // 超时 2 分钟
    setTimeout(() => {
      child.kill();
      reject({ file: path.basename(filePath), error: 'TIMEOUT' });
    }, 120000);
  });
}

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Agent 架构综合测试运行器 v1.0.0                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const startTime = Date.now();

  for (const [category, files] of Object.entries(testFiles)) {
    console.log(`\n📦 ${category}`);
    console.log('─'.repeat(60));

    results.modules[category] = [];

    for (const file of files) {
      const fullPath = path.join(__dirname, file);

      if (!fs.existsSync(fullPath)) {
        console.log(`  ⏭️  ${path.basename(file)} - 文件不存在，跳过`);
        continue;
      }

      process.stdout.write(`  ▶ ${path.basename(file)}... `);

      try {
        const result = await runTest(fullPath);

        if (result.code === 0) {
          console.log(`✅ (${result.passed} passed, ${result.duration}ms)`);
        } else {
          console.log(`❌ (${result.passed} passed, ${result.failed} failed, ${result.duration}ms)`);

          // 显示失败信息
          const failedLines = result.stdout.split('\n')
            .filter(line => line.includes('❌'))
            .slice(0, 3);

          for (const line of failedLines) {
            console.log(`     ${line.trim()}`);
          }
        }

        results.summary.total += result.passed + result.failed;
        results.summary.passed += result.passed;
        results.summary.failed += result.failed;

        results.modules[category].push({
          file: result.file,
          passed: result.passed,
          failed: result.failed,
          duration: result.duration,
          success: result.code === 0
        });

      } catch (err) {
        console.log(`❌ ERROR: ${err.error || err.message}`);
        results.summary.failed++;
        results.modules[category].push({
          file: path.basename(file),
          error: err.error || err.message,
          success: false
        });
      }
    }
  }

  results.summary.duration = Date.now() - startTime;

  // 打印汇总
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      测试汇总                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const passRate = results.summary.total > 0
    ? ((results.summary.passed / results.summary.total) * 100).toFixed(1)
    : 0;

  console.log(`  总测试数: ${results.summary.total}`);
  console.log(`  通过:     ${results.summary.passed} ✅`);
  console.log(`  失败:     ${results.summary.failed} ❌`);
  console.log(`  通过率:   ${passRate}%`);
  console.log(`  总耗时:   ${(results.summary.duration / 1000).toFixed(2)}s`);
  console.log('\n');

  // 按模块汇总
  console.log('📊 模块详情:');
  console.log('─'.repeat(60));

  for (const [category, tests] of Object.entries(results.modules)) {
    const passed = tests.reduce((sum, t) => sum + (t.passed || 0), 0);
    const failed = tests.reduce((sum, t) => sum + (t.failed || 0), 0);
    const duration = tests.reduce((sum, t) => sum + (t.duration || 0), 0);
    const success = tests.every(t => t.success !== false);

    const icon = success ? '✅' : '❌';
    console.log(`  ${icon} ${category}: ${passed} passed, ${failed} failed (${duration}ms)`);
  }

  console.log('\n');

  // 保存 JSON 报告
  const reportPath = path.join(__dirname, '../../docs/test-results/comprehensive-test-report.json');
  const reportDir = path.dirname(reportPath);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    ...results
  }, null, 2));

  // 计算相对于项目根目录的路径
  const relativeReportPath = path.relative(path.join(__dirname, '../..'), reportPath);
  console.log(`  📄 报告已保存: ${relativeReportPath}`);
  console.log('\n');

  // 返回状态码
  return results.summary.failed === 0 ? 0 : 1;
}

// 运行
runAllTests()
  .then(code => {
    process.exit(code);
  })
  .catch(err => {
    console.error('测试运行器错误:', err);
    process.exit(1);
  });
