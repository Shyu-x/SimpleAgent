/**
 * DI 框架测试
 * 验证依赖注入容器的功能
 */

const { DIContainer } = require('./common/di');

// 模拟 MiniMaxChatClient
class MockMiniMaxChatClient {
  constructor(options = {}) {
    this.options = options;
  }

  async chat(params) {
    return {
      content: [{ text: '{"result": "mocked"}' }],
    };
  }
}

// 测试服务 A
class ServiceA {
  constructor(deps) {
    this.name = deps.name;
  }
}

// 测试服务 B
class ServiceB {
  constructor(deps) {
    this.serviceA = deps.serviceA;
    this.config = deps.config;
  }
}

// 测试服务 C (循环依赖测试)
class ServiceC {
  constructor(deps) {
    this.serviceD = deps.serviceD;
  }
}

class ServiceD {
  constructor(deps) {
    this.serviceC = deps.serviceC;
  }
}

// 测试 QueryRewriteService
const { QueryRewriteService } = require('./domain/rag/QueryRewriteService.di');

async function runTests() {
  console.log('='.repeat(60));
  console.log('DI 框架测试');
  console.log('='.repeat(60));

  const container = new DIContainer();

  // 测试 1: 基本注册和解析
  console.log('\n--- 测试 1: 基本注册和解析 ---');
  container.register('serviceA', ServiceA)
    .inject({ name: { value: 'ServiceA-instance' } });

  const serviceA = container.resolve('serviceA');
  console.log(`ServiceA name: ${serviceA.name}`);
  console.log('✓ 基本注册和解析成功');

  // 测试 2: 单例模式
  console.log('\n--- 测试 2: 单例模式 ---');
  container.register('singletonService', ServiceA)
    .singleton()
    .inject({ name: { value: 'Singleton' } });

  const s1 = container.resolve('singletonService');
  const s2 = container.resolve('singletonService');
  console.log(`Same instance: ${s1 === s2}`);
  console.log(s1 === s2 ? '✓ 单例模式正确' : '✗ 单例模式失败');

  // 测试 3: 原型模式
  console.log('\n--- 测试 3: 原型模式 ---');
  container.register('prototypeService', ServiceA)
    .prototype()
    .inject({ name: { value: 'Prototype' } });

  const p1 = container.resolve('prototypeService');
  const p2 = container.resolve('prototypeService');
  console.log(`Different instances: ${p1 !== p2}`);
  console.log(p1 !== p2 ? '✓ 原型模式正确' : '✗ 原型模式失败');

  // 测试 4: 依赖注入
  console.log('\n--- 测试 4: 依赖注入 ---');
  container.register('serviceA2', ServiceA)
    .inject({ name: { value: 'ServiceA2' } });

  container.register('serviceB', ServiceB)
    .inject({
      serviceA: 'serviceA2',
      config: { value: { timeout: 5000 } },
    });

  const serviceB = container.resolve('serviceB');
  console.log(`serviceB.serviceA.name: ${serviceB.serviceA.name}`);
  console.log(`serviceB.config.timeout: ${serviceB.config.timeout}`);
  console.log(serviceB.serviceA instanceof ServiceA ? '✓ 依赖注入成功' : '✗ 依赖注入失败');

  // 测试 5: 工厂函数 (通过内联工厂注入)
  console.log('\n--- 测试 5: 工厂函数 ---');
  container.register('factoryService', ServiceA)
    .inject({
      name: { factory: (c) => 'Factory-Created' }
    });

  const factoryService = container.resolve('factoryService');
  console.log(`factoryService.name: ${factoryService.name}`);
  console.log(factoryService.name === 'Factory-Created' ? '✓ 工厂函数成功' : '✗ 工厂函数失败');

  // 测试 6: 直接实例注册
  console.log('\n--- 测试 6: 直接实例注册 ---');
  const prebuiltInstance = new ServiceA({ name: 'Prebuilt' });
  container.register('prebuiltService', prebuiltInstance);

  const prebuilt = container.resolve('prebuiltService');
  console.log(`prebuilt.name: ${prebuilt.name}`);
  console.log(prebuilt === prebuiltInstance ? '✓ 直接实例注册成功' : '✗ 直接实例注册失败');

  // 测试 7: 循环依赖检测
  console.log('\n--- 测试 7: 循环依赖检测 ---');
  container.reset();
  container.register('serviceC', ServiceC).inject({ serviceD: 'serviceD' });
  container.register('serviceD', ServiceD).inject({ serviceC: 'serviceC' });

  try {
    container.resolve('serviceC');
    console.log('✗ 循环依赖未被检测');
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.log(error.message.includes('Circular') ? '✓ 循环依赖检测成功' : '✗ 循环依赖检测失败');
  }

  // 测试 8: 依赖图分析
  console.log('\n--- 测试 8: 依赖图分析 ---');
  container.reset();
  container.register('client', MockMiniMaxChatClient)
    .inject({ apiKey: { value: 'test-key' } });
  container.register('rewriteService', QueryRewriteService)
    .inject({ modelClient: 'client' });

  const graph = container.getDependencyGraph();
  console.log('依赖图:');
  console.log(JSON.stringify(graph, null, 2));
  console.log('✓ 依赖图生成成功');

  // 测试 9: 验证依赖
  console.log('\n--- 测试 9: 验证依赖 ---');
  container.register('missingDep', ServiceB).inject({ serviceA: 'nonExistent' });
  const validation = container.validateDependencies();
  console.log(`Validation valid: ${validation.valid}`);
  console.log(`Missing deps: ${validation.missing.join(', ')}`);
  console.log(validation.valid ? '✗ 验证应该失败' : '✓ 缺失依赖检测成功');

  // 测试 10: QueryRewriteService DI 模式
  console.log('\n--- 测试 10: QueryRewriteService DI 模式 ---');
  container.reset();
  container.register('mockClient', MockMiniMaxChatClient)
    .inject({ apiKey: { value: 'test-key' } });
  container.register('queryRewriteService', QueryRewriteService)
    .inject({
      modelClient: 'mockClient',
      defaultModel: { value: 'MiniMax-M2.7' },
    });

  const rewriteService = container.resolve('queryRewriteService');
  console.log(`rewriteService.defaultModel: ${rewriteService.defaultModel}`);
  console.log(`rewriteService.modelClient: ${rewriteService.modelClient ? 'injected' : 'null'}`);
  console.log(rewriteService.modelClient instanceof MockMiniMaxChatClient ? '✓ QueryRewriteService DI 成功' : '✗ QueryRewriteService DI 失败');

  // 测试 11: 无 modelClient 时的降级行为
  console.log('\n--- 测试 11: 无 modelClient 时的降级行为 ---');
  container.reset();
  container.register('rewriteServiceNoClient', QueryRewriteService)
    .inject({
      defaultModel: { value: 'MiniMax-M2.7' },
    });

  const rewriteServiceNoClient = container.resolve('rewriteServiceNoClient');
  console.log(`rewriteServiceNoClient.modelClient: ${rewriteServiceNoClient.modelClient}`);

  // 测试需要 modelClient 的方法（expand）
  try {
    await rewriteServiceNoClient.expand('测试查询');
    console.log('✗ 应该抛出错误');
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.log(error.message.includes('modelClient not injected') ? '✓ 正确抛出错误' : '✗ 错误处理不正确');
  }

  console.log('\n' + '='.repeat(60));
  console.log('所有测试完成');
  console.log('='.repeat(60));
}

runTests().catch(console.error);