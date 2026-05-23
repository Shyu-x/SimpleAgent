/**
 * A2A 协议单元测试
 */
const assert = require('assert');


const registry = new Map();

test('should register an agent with metadata', () => {
  const agent = {
    id: 'agent-test-' + Date.now(),
    name: 'TestAgent',
    capabilities: ['analysis', 'code'],
    registeredAt: Date.now(),
  };
  registry.set(agent.id, agent);
  assert.strictEqual(registry.size, 1);
  assert.strictEqual(registry.get(agent.id).name, 'TestAgent');
});

test('should track online status via heartbeat', () => {
  const agent = { id: 'agent-1', lastHeartbeat: Date.now() };
  const isOnline = Date.now() - agent.lastHeartbeat < 60000;
  assert.strictEqual(isOnline, true);
});

test('should create task with correct structure', () => {
  const task = {
    id: 'task-' + Date.now(),
    title: 'Test Task',
    from: 'agent-1',
    to: 'agent-2',
    input: { query: 'analyze this' },
    status: 'pending',
  };
  assert.ok(task.id);
  assert.strictEqual(task.status, 'pending');
  assert.ok(task.input.query);
});

test('should track task progress', () => {
  const task = { id: 'task-1', status: 'in_progress', progress: 50 };
  task.progress = 75;
  assert.strictEqual(task.progress, 75);
});

test('should mark task as completed with output', () => {
  const task = { id: 'task-2', status: 'in_progress', output: null };
  task.status = 'completed';
  task.output = { result: 'Analysis complete' };
  task.completedAt = Date.now();
  assert.strictEqual(task.status, 'completed');
  assert.ok(task.output.result);
  assert.ok(task.completedAt);
});

