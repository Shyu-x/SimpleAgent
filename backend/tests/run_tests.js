/**
 * API 集成测试运行器
 *
 * 运行方式:
 *   node run_tests.js              # 运行所有测试
 *   node run_tests.js chat         # 只运行 chat 测试
 *   node run_tests.js search       # 只运行 search 测试
 *   node run_tests.js agent        # 只运行 agent 测试
 *   node run_tests.js rag          # 只运行 rag 测试
 *   node run_tests.js config       # 只运行 config 测试
 */

const { spawn } = require('child_process');
const path = require('path');

const testFiles = {
  chat: 'api_chat.test.js',
  search: 'api_search.test.js',
  agent: 'api_agent.test.js',
  rag: 'api_rag.test.js',
  config: 'api_config.test.js'
};

const testsDir = __dirname;

async function runTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log('='.repeat(60));

    const child = spawn('node', [path.join(testsDir, testFile)], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n[PASS] ${testFile} completed successfully`);
        resolve(true);
      } else {
        console.log(`\n[FAIL] ${testFile} exited with code ${code}`);
        resolve(false);
      }
    });

    child.on('error', (err) => {
      console.error(`[ERROR] Failed to run ${testFile}:`, err.message);
      reject(err);
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
    return;
  }

  console.log('Starting API Integration Tests');
  console.log(`Backend URL: http://localhost:30000`);
  console.log(`Tests to run: ${testsToRun.join(', ')}`);

  // 检查后端是否运行
  const http = require('http');
  const checkBackend = () => new Promise((resolve) => {
    const req = http.get('http://localhost:30000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });

  console.log('\nChecking backend connection...');
  const isBackendRunning = await checkBackend();

  if (!isBackendRunning) {
    console.log('\n[WARNING] Backend is not responding at http://localhost:30000');
    console.log('Please ensure the backend server is running:');
    console.log('  cd backend && npm start');
    console.log('\nProceeding with tests anyway...\n');
  } else {
    console.log('[OK] Backend is running\n');
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
      console.error(`Error running ${testFile}:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log(`Total: ${testsToRun.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
