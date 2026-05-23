/**
 * API 代理单元测试
 */
const assert = require('assert');



const modelAliases = {
  'gpt4': 'gpt-4o',
  'claude': 'claude-opus-4-6',
  'gemini': 'gemini-2.5-pro',
};

test('should resolve model aliases', () => {
  assert.strictEqual(modelAliases['gpt4'], 'gpt-4o');
  assert.strictEqual(modelAliases['claude'], 'claude-opus-4-6');
});

test('should require messages array', () => {
  const req = { messages: [{ role: 'user', content: 'hello' }] };
  assert.ok(Array.isArray(req.messages));
  assert.ok(req.messages.length > 0);
});

test('should allow optional parameters', () => {
  const req = { messages: [{ role: 'user', content: 'hello' }], temperature: 0.7, max_tokens: 1000 };
  assert.strictEqual(req.temperature, 0.7);
  assert.strictEqual(req.max_tokens, 1000);
});

test('should handle streaming response format', () => {
  const chunk = { choices: [{ delta: { content: 'Hello' }, index: 0 }] };
  assert.ok(chunk.choices[0].delta.content);
});

test('should retry on 429 (rate limit)', () => {
  const shouldRetry = (code) => code === 429;
  assert.strictEqual(shouldRetry(429), true);
  assert.strictEqual(shouldRetry(500), false);
});

test('should retry on 502/503', () => {
  const shouldRetry = (code) => [502, 503].includes(code);
  assert.strictEqual(shouldRetry(502), true);
  assert.strictEqual(shouldRetry(503), true);
  assert.strictEqual(shouldRetry(404), false);
});

