// 健康检查脚本
const http = require('http');

function checkEndpoint(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve({ status: res.statusCode, ok: res.statusCode === 200 });
    }).on('error', () => {
      resolve({ status: 0, ok: false });
    });
  });
}

async function main() {
  console.log('=== 健康检查 ===');

  const health = await checkEndpoint('http://localhost:30000/api/health');
  console.log(`后端: ${health.ok ? '✓' : '✗'} (${health.status})`);

  const frontend = await checkEndpoint('http://localhost:3001');
  console.log(`前端: ${frontend.ok ? '✓' : '✗'} (${frontend.status})`);

  console.log('\n=== 完成 ===');
}

main();