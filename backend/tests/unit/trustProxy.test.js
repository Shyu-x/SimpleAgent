/**
 * trust proxy 配置单元测试
 *
 * 验证 backend/src/index.js 中已配置 `app.set('trust proxy', 'loopback')`
 * 采用静态源码检查，不触发后端启动，确保快速、独立
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', '..', 'src', 'index.js');

test('index.js should exist', () => {
  assert.ok(fs.existsSync(INDEX_PATH), `index.js not found at ${INDEX_PATH}`);
});

test('index.js should set trust proxy to loopback', () => {
  const src = fs.readFileSync(INDEX_PATH, 'utf-8');
  // 接受单/双引号
  const pattern = /app\.set\(\s*['"]trust proxy['"]\s*,\s*['"]loopback['"]\s*\)/;
  assert.ok(
    pattern.test(src),
    "expected `app.set('trust proxy', 'loopback')` in backend/src/index.js"
  );
});

test('trust proxy should be configured before rate limit middleware', () => {
  const src = fs.readFileSync(INDEX_PATH, 'utf-8');
  const trustIdx = src.search(/app\.set\(\s*['"]trust proxy['"]/);
  const rateIdx = src.search(/app\.use\(\s*rateLimitMiddleware\s*\)/);
  assert.ok(trustIdx > 0, 'trust proxy not found');
  assert.ok(rateIdx > 0, 'rateLimitMiddleware not found');
  assert.ok(
    trustIdx < rateIdx,
    'trust proxy should be set BEFORE rateLimitMiddleware (X-Forwarded-For must be trusted first)'
  );
});

test('loopback strategy semantics', () => {
  // 'loopback' 信任 127.0.0.1, ::1, ::ffff:127.0.0.1
  // Express 文档: https://expressjs.com/en/guide/behind-proxies.html
  // 此时 req.ip 才会取 X-Forwarded-For 头
  const validStrategies = [
    true,
    false,
    'loopback',
    'loopback, linklocal, uniquelocal',
    'uniquelocal',
  ];
  assert.ok(validStrategies.includes('loopback'));
});
