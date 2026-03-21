const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = 'C:\\Users\\Xu\\Desktop\\chat玩具';
const logsDir = path.join(root, 'logs');

fs.mkdirSync(logsDir, { recursive: true });

function nowTag() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

const tag = nowTag();

function startService(name, cwd) {
  const outPath = path.join(logsDir, `${tag}-${name}.out.log`);
  const errPath = path.join(logsDir, `${tag}-${name}.err.log`);

  const out = fs.openSync(outPath, 'a');
  const err = fs.openSync(errPath, 'a');

  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'npm.cmd', 'run', 'dev'], {
    cwd,
    detached: true,
    stdio: ['ignore', out, err],
    shell: false,
  });

  child.unref();
  return { pid: child.pid, outPath, errPath };
}

const backendPid = startService('backend-dev', path.join(root, 'backend'));
const frontendPid = startService('frontend-dev', path.join(root, 'frontend'));

console.log(JSON.stringify({ tag, backend: backendPid, frontend: frontendPid }));
