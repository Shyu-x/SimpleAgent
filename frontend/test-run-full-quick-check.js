const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');
const backendCandidates = ['http://localhost:30000', 'http://localhost:8081'];

function runCommand(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  child.stdout?.on('data', (data) => {
    process.stdout.write(data);
  });
  child.stderr?.on('data', (data) => {
    process.stderr.write(data);
  });

  return child;
}

async function waitFor(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function resolveBackendUrl() {
  for (const candidate of backendCandidates) {
    try {
      await waitFor(`${candidate}/api/health`, 5000);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Timed out waiting for backend. Tried: ${backendCandidates.join(', ')}`);
}

function terminate(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');
}

async function main() {
  let backend = null;
  let frontend = null;

  try {
    let backendUrl = null;
    try {
      backendUrl = await resolveBackendUrl();
      console.log(`Detected running backend: ${backendUrl}`);
    } catch {
      console.log('No running backend detected, starting backend dev server...');
      backend = runCommand('npm', ['run', 'dev'], backendDir);
      backendUrl = await resolveBackendUrl();
      console.log(`Backend ready: ${backendUrl}`);
    }

    console.log('Starting frontend production server on 5174...');
    frontend = runCommand('npx', ['next', 'start', '-p', '5174'], frontendDir);
    await waitFor('http://localhost:5174');
    console.log('Frontend ready: http://localhost:5174');

    const checker = runCommand('npm', ['run', 'quick:check'], frontendDir, {
      BACKEND_URL: backendUrl,
      FRONTEND_URL: 'http://localhost:5174',
    });

    const exitCode = await new Promise((resolve, reject) => {
      checker.on('exit', (code) => resolve(code ?? 1));
      checker.on('error', reject);
    });

    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    terminate(frontend);
    terminate(backend);
  }
}

main().catch((error) => {
  console.error('联调快检失败:', error.message);
  process.exit(1);
});
