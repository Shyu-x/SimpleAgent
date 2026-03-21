const { spawn } = require('child_process');

function runCommand(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
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

function terminate(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');
}

async function main() {
  const server = runCommand('npx', ['next', 'start', '-p', '5174']);

  try {
    await waitFor('http://localhost:5174');

    const checker = runCommand('npm', ['run', 'quick:check'], {
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
    terminate(server);
  }
}

main().catch((error) => {
  console.error('前端快检失败:', error.message);
  process.exit(1);
});
