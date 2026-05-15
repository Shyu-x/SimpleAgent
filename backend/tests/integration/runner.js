/**
 * 集成测试运行器
 *
 * 运行方式:
 *   node integration/runner.js                    # 运行所有集成测试
 *   node integration/runner.js chat               # 只运行聊天 API 测试
 *   node integration/runner.js admin              # 只运行管理后台 API 测试
 *   node integration/runner.js metrics            # 只运行指标 API 测试
 *   node integration/runner.js hitl               # 只运行 HITL API 测试
 *   node integration/runner.js mission            # 只运行任务控制 API 测试
 *   node integration/runner.js memory             # 只运行记忆 API 测试
 *
 * Jest 运行:
 *   npm test -- --testPathPattern=integration/    # 运行所有集成测试
 *   npm test -- --testPathPattern=integration/chatApi.test.js
 */

const { spawn } = require('child_process');
const path = require('path');

const testFiles = {
  chat: 'chatApi.test.js',
  admin: 'adminApi.test.js',
  metrics: 'metricsApi.test.js',
  hitl: 'hitlApi.test.js',
  mission: 'missionApi.test.js',
  memory: 'memoryApi.test.js'
};

const testsDir = path.join(__dirname);

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(name, status, message) {
  const icon = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'RUN';
  const color = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
  console.log(`${color}[${icon}]${colors.reset} ${name}: ${message}`);
}

async function runTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60));

    const child = spawn('node', [testFile], {
      cwd: testsDir,
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(testFile, 'PASS', 'All tests passed');
        resolve(true);
      } else {
        log(testFile, 'FAIL', `Exited with code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      log(testFile, 'FAIL', err.message);
      reject(err);
    });
  });
}

async function checkBackend() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get('http://localhost:30000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const testsToRun = args.length > 0
    ? args.map(arg => testFiles[arg]).filter(Boolean)
    : Object.values(testFiles);

  if (testsToRun.length === 0) {
    console.log('Available tests:');
    Object.keys(testFiles).forEach(name => {
      console.log(`  - ${name}: ${testFiles[name]}`);
    });
    console.log('\nJest 运行: npm test -- --testPathPattern=integration/');
    return;
  }

  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('AI Chat 玩具 - 集成测试套件');
  console.log('='.repeat(60) + colors.reset);
  console.log('Backend: http://localhost:30000');
  console.log('Tests: ' + testsToRun.join(', '));

  // 检查后端
  console.log('\nChecking backend connection...');
  const isBackendRunning = await checkBackend();

  if (!isBackendRunning) {
    console.log(`${colors.red}[WARNING] Backend is not responding${colors.reset}`);
    console.log('Please ensure backend is running: cd backend && npm start');
    console.log('Proceeding anyway...\n');
  } else {
    console.log(`${colors.green}[OK] Backend is running${colors.reset}\n`);
  }

  let passed = 0;
  let failed = 0;

  for (const testFile of testsToRun) {
    try {
      const result = await runTest(testFile);
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + colors.blue + '='.repeat(60));
  console.log('Integration Test Summary');
  console.log('='.repeat(60) + colors.reset);
  console.log('Total: ' + testsToRun.length);
  console.log(colors.green + 'Passed: ' + passed + colors.reset);
  console.log(colors.red + 'Failed: ' + failed + colors.reset);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);