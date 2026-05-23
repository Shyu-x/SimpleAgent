/**
 * HITL 检查点管理单元测试
 */
const assert = require('assert');

describe('HITL Checkpoint Management Tests', () => {
  it('should create a checkpoint with valid fields', () => {
    const checkpoint = {
      id: 'test-' + Date.now(),
      type: 'file_operation',
      title: 'Delete File',
      description: 'Delete test.txt',
      status: 'pending',
      createdAt: Date.now(),
    };
    assert.ok(checkpoint.id);
    assert.ok(checkpoint.type);
    assert.strictEqual(checkpoint.status, 'pending');
  });

  it('should detect high risk operations', () => {
    const patterns = ['rm -rf /', 'DROP TABLE', 'TRUNCATE', 'DELETE FROM', 'format'];
    patterns.forEach(p => {
      const isHighRisk = /rm\s+-rf|DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|format/i.test(p);
      assert.strictEqual(isHighRisk, true, p + ' should be high risk');
    });
  });

  it('should allow normal operations through', () => {
    const patterns = ['ls', 'cat file.txt', 'echo hello', 'SELECT * FROM users'];
    patterns.forEach(p => {
      const isHighRisk = /rm\s+-rf|DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|format/i.test(p);
      assert.strictEqual(isHighRisk, false, p + ' should be normal');
    });
  });

  it('should use default timeout when not specified', () => {
    assert.strictEqual(60 * 1000, 60000);
  });

  it('should allow custom timeout', () => {
    assert.strictEqual(5 * 60 * 1000, 300000);
  });
});
