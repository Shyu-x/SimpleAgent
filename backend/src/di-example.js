/**
 * DI 容器使用示例
 *
 * 本文件展示如何正确使用 DI 容器来解耦 domain 层与 infrastructure 层依赖
 */

const { DIContainer } = require('./common/di');
const { QueryRewriteService } = require('./domain/rag/QueryRewriteService.di');

/**
 * 示例 1: 基本使用模式
 *
 * 将 domain 层服务配置为通过 DI 容器注入 infrastructure 依赖
 */
function exampleBasic() {
  console.log('=== 示例 1: 基本使用模式 ===');

  const container = new DIContainer();

  // 1. 注册基础设施服务 (singleton)
  container.register('modelClient', require('./services/model/clients/MiniMaxChatClient'))
    .singleton()
    .inject({
      apiKey: { value: process.env.MINIMAX_API_KEY },
      baseUrl: { value: process.env.MINIMAX_BASE_URL },
      defaultModel: { value: 'MiniMax-M2.7' },
    });

  // 2. 注册领域服务，注入基础设施依赖
  container.register('queryRewriteService', QueryRewriteService)
    .inject({
      modelClient: 'modelClient',  // 引用其他服务
      defaultModel: { value: 'MiniMax-M2.7' },
      enableContextCompletion: { value: true },
      enableSemanticExpansion: { value: true },
    });

  // 3. 解析使用
  const service = container.resolve('queryRewriteService');
  console.log('Service created:', !!service);
  console.log('Has modelClient:', !!service.modelClient);

  return container;
}

/**
 * 示例 2: 单例服务管理
 *
 * 对于配置、缓存等共享服务使用单例模式
 */
function exampleSingleton() {
  console.log('\n=== 示例 2: 单例服务管理 ===');

  const container = new DIContainer();

  // 共享配置单例
  container.register('config', class ConfigService {
    constructor(deps) {
      this.data = deps.configData || {};
    }
    get(key) { return this.data[key]; }
  })
    .singleton()
    .inject({ configData: { value: { port: 3000 } } });

  // 注册两个服务，都引用同一个 config 单例
  container.register('serviceA', class ServiceA {
    constructor(deps) {
      this.config = deps.config;
    }
    getPort() { return this.config.get('port'); }
  })
    .inject({ config: 'config' });

  container.register('serviceB', class ServiceB {
    constructor(deps) {
      this.config = deps.config;
    }
    getPort() { return this.config.get('port'); }
  })
    .inject({ config: 'config' });

  const serviceA = container.resolve('serviceA');
  const serviceB = container.resolve('serviceB');

  console.log('Same config instance:', serviceA.config === serviceB.config);
  console.log('Port from A:', serviceA.getPort());
  console.log('Port from B:', serviceB.getPort());

  return container;
}

/**
 * 示例 3: 工厂函数创建复杂实例
 *
 * 当服务需要复杂的初始化逻辑时使用工厂函数
 */
function exampleFactory() {
  console.log('\n=== 示例 3: 工厂函数创建 ===');

  const container = new DIContainer();

  // 使用工厂函数创建复杂服务
  container.register('logger', class Logger {
    constructor(deps) {
      this.name = deps.name;
      this.level = deps.level;
    }
    log(msg) { console.log(`[${this.level}] ${this.name}: ${msg}`); }
  })
    .inject({
      name: { value: 'AppLogger' },
      level: { value: 'info' },
    });

  // 工厂函数可以访问容器，动态组装依赖
  const ComplexService = class {
    constructor(deps) {
      this.logger = deps.logger;
      this.client = deps.client;
    }
  };

  container.registerAs('complexService', ComplexService, {
    lifecycle: 'prototype',
    factory: (c) => {
      return new ComplexService({
        logger: c.resolve('logger'),
        client: c.resolve('modelClient'),
      });
    }
  });

  // 注意: 需要先注册 modelClient
  container.register('modelClient', class MockClient {})
    .inject({});

  const service = container.resolve('complexService');
  console.log('Service has logger:', !!service.logger);
  console.log('Service has client:', !!service.client);

  return container;
}

/**
 * 示例 4: 运行时覆盖
 *
 * 在解析时可以覆盖注入的依赖
 */
function exampleOverride() {
  console.log('\n=== 示例 4: 运行时覆盖 ===');

  const container = new DIContainer();

  container.register('service', class Service {
    constructor(deps) {
      this.timeout = deps.timeout;
    }
  })
    .inject({ timeout: { value: 5000 } });

  // 使用默认超时
  const defaultService = container.resolve('service');
  console.log('Default timeout:', defaultService.timeout);

  // 运行时覆盖
  const customService = container.resolve('service', { timeout: 10000 });
  console.log('Custom timeout:', customService.timeout);

  return container;
}

/**
 * 示例 5: 依赖分析
 *
 * 使用容器提供的分析工具检查依赖关系
 */
function exampleAnalysis() {
  console.log('\n=== 示例 5: 依赖分析 ===');

  const container = new DIContainer();

  container.register('client', class Client {})
    .inject({});
  container.register('serviceA', class ServiceA {})
    .inject({ client: 'client' });
  container.register('serviceB', class ServiceB {})
    .inject({ serviceA: 'serviceA' });
  container.register('serviceC', class ServiceC {})
    .inject({ serviceB: 'serviceB' });

  // 获取依赖图
  const graph = container.getDependencyGraph();
  console.log('Dependency graph:', JSON.stringify(graph, null, 2));

  // 验证依赖完整性
  const validation = container.validateDependencies();
  console.log('Validation valid:', validation.valid);
  console.log('Validation details:', JSON.stringify(validation, null, 2));

  return container;
}

/**
 * 示例 6: 单元测试 Mock
 *
 * DI 容器使单元测试更简单
 */
function exampleMocking() {
  console.log('\n=== 示例 6: 单元测试 Mock ===');

  const container = new DIContainer();

  // 注册 Mock 客户端
  const mockClient = {
    chat: async () => ({ content: [{ text: 'Mocked response' }] })
  };
  container.register('modelClient', mockClient);  // 直接注册实例

  // 注册 QueryRewriteService
  container.register('queryRewriteService', QueryRewriteService)
    .inject({
      modelClient: 'modelClient',
      defaultModel: { value: 'MiniMax-M2.7' },
    });

  const service = container.resolve('queryRewriteService');
  console.log('Service with mock client:', !!service);
  console.log('Mock client type:', service.modelClient.constructor.name);

  return container;
}

// 运行所有示例
async function main() {
  console.log('='.repeat(60));
  console.log('DI 容器使用示例');
  console.log('='.repeat(60));

  try {
    exampleBasic();
    exampleSingleton();
    exampleFactory();
    exampleOverride();
    exampleAnalysis();
    exampleMocking();

    console.log('\n' + '='.repeat(60));
    console.log('所有示例执行完成');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Example error:', error);
  }
}

main();