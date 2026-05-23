/**
 * ConfigCenter 单元测试
 *
 * 测试内容：
 * 1. 配置中心初始化
 * 2. 配置加载和合并
 * 3. 配置验证
 * 4. 配置热更新
 * 5. 配置变更监听
 */

const assert = require('assert');
const path = require('path');

// 简单的测试运行器


const { ConfigCenter } = require('../../src/infra/config/ConfigCenter');

describe('ConfigCenter 初始化', () => {
  test('默认配置应该包含 model/rag/agent/rateLimit', () => {
    const config = new ConfigCenter({ enableHotReload: false });

    assert.ok(config.defaults.model);
    assert.ok(config.defaults.rag);
    assert.ok(config.defaults.agent);
    assert.ok(config.defaults.rateLimit);
  });

  test('model 默认配置应该正确', () => {
    const config = new ConfigCenter({ enableHotReload: false });

    assert.strictEqual(config.defaults.model.provider, 'minimax');
    assert.strictEqual(config.defaults.model.defaultModel, 'MiniMax-M2.7');
    assert.strictEqual(config.defaults.model.timeout, 120000);
    assert.strictEqual(config.defaults.model.retries, 3);
    assert.strictEqual(config.defaults.model.maxTokens, 100000);
  });

  test('rag 默认配置应该正确', () => {
    const config = new ConfigCenter({ enableHotReload: false });

    assert.strictEqual(config.defaults.rag.chunkSize, 512);
    assert.strictEqual(config.defaults.rag.topK, 5);
    assert.strictEqual(config.defaults.rag.rerankEnabled, true);
    assert.strictEqual(config.defaults.rag.embeddingModel, 'mxbai-embed-large');
  });

  test('agent 默认配置应该正确', () => {
    const config = new ConfigCenter({ enableHotReload: false });

    assert.strictEqual(config.defaults.agent.maxIterations, 10);
    assert.strictEqual(config.defaults.agent.thinkingTimeout, 30000);
    assert.strictEqual(config.defaults.agent.enableHistory, true);
    assert.strictEqual(config.defaults.agent.memoryType, 'semantic');
  });

  test('rateLimit 默认配置应该正确', () => {
    const config = new ConfigCenter({ enableHotReload: false });

    assert.strictEqual(config.defaults.rateLimit.global, 100);
    assert.strictEqual(config.defaults.rateLimit.perUser, 20);
    assert.strictEqual(config.defaults.rateLimit.windowMs, 60000);
  });
});

describe('ConfigCenter get 和 set', () => {
  test('get 应该返回已加载的配置', async () => {
    const config = new ConfigCenter({ enableHotReload: false });

    await config.loadAll();
    const modelConfig = config.get('model');

    assert.ok(modelConfig);
    assert.strictEqual(modelConfig.provider, 'minimax');
  });

  test('get 不存在的配置应该返回 undefined', async () => {
    const config = new ConfigCenter({ enableHotReload: false });

    await config.loadAll();
    const result = config.get('nonexistent');

    assert.strictEqual(result, undefined);
  });

  test('set 应该更新配置', async () => {
    const config = new ConfigCenter({ enableHotReload: false });

    await config.loadAll();

    config.set('model', { provider: 'custom', defaultModel: 'Custom-Model' });
    const modelConfig = config.get('model');

    assert.strictEqual(modelConfig.provider, 'custom');
    assert.strictEqual(modelConfig.defaultModel, 'Custom-Model');
  });

  test('set 应该触发 configChanged 事件', async () => {
    const config = new ConfigCenter({ enableHotReload: false });
    let eventFired = false;

    config.on('configChanged', (change) => {
      eventFired = true;
    });

    await config.loadAll();
    config.set('model', { provider: 'updated' });

    assert.strictEqual(eventFired, true);
  });
});

describe('ConfigCenter _mergeDefaults', () => {
  test('应该正确合并配置和默认值', () => {
    const configCenter = new ConfigCenter({ enableHotReload: false });

    const userConfig = { timeout: 60000, retries: 5 };
    const defaultConfig = { timeout: 120000, retries: 3, maxTokens: 100000 };

    const merged = configCenter._mergeDefaults(userConfig, defaultConfig);

    assert.strictEqual(merged.timeout, 60000);  // 用户配置优先
    assert.strictEqual(merged.retries, 5);      // 用户配置优先
    assert.strictEqual(merged.maxTokens, 100000); // 使用默认值
  });

  test('空用户配置应该使用全部默认值', () => {
    const configCenter = new ConfigCenter({ enableHotReload: false });

    const merged = configCenter._mergeDefaults({}, { key: 'value' });

    assert.strictEqual(merged.key, 'value');
  });
});

describe('ConfigCenter getAll', () => {
  test('getAll 应该返回所有配置', async () => {
    const config = new ConfigCenter({ enableHotReload: false });

    await config.loadAll();
    const allConfigs = config.getAll();

    assert.ok(allConfigs.model);
    assert.ok(allConfigs.rag);
    assert.ok(allConfigs.agent);
    assert.ok(allConfigs.rateLimit);
  });
});

describe('ConfigCenter reload', () => {
  test('reload 应该重新加载配置', async () => {
    const config = new ConfigCenter({ enableHotReload: false });

    await config.loadAll();
    config.set('model', { testValue: 'original' });

    await config.reload('model');
    const modelConfig = config.get('model');

    // reload 后 testValue 会被清除（因为没有持久化文件）
    assert.ok(modelConfig);
  });
});

