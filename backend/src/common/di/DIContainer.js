/**
 * DIContainer - 依赖注入容器
 *
 * 企业级设计：
 * - 支持构造函数注入和 setter 注入
 * - 支持单例和原型模式
 * - 支持循环依赖检测
 * - 支持自动装配
 *
 * 使用场景：
 * - 解耦 domain 层与 infrastructure 层依赖
 * - 统一管理服务生命周期
 * - 便于单元测试 mock
 *
 * @example
 * // 注册服务
 * container.register('modelClient', MiniMaxChatClient)
 *   .singleton()
 *   .inject({ apiKey: process.env.MINIMAX_API_KEY });
 *
 * // 解析服务
 * const client = container.resolve('modelClient');
 *
 * // 构造函数注入示例
 * class QueryRewriteService {
 *   constructor(options) {
 *     this.modelClient = options.modelClient;
 *   }
 * }
 * container.register('queryRewriteService', QueryRewriteService)
 *   .inject({ modelClient: 'modelClient' });
 */

class DIContainer {
  constructor() {
    /** @type {Map<string, Registration>} 服务注册表 */
    this.services = new Map();
    /** @type {Map<string, any>} 单例实例缓存 */
    this.instances = new Map();
    /** @type {Set<string>} 正在解析的服务（用于循环检测） */
    this.resolving = new Set();
    /** @type {Map<string, string[]>} 依赖关系图（用于分析） */
    this.dependencyGraph = new Map();
  }

  /**
   * 注册服务
   * @param {string} name - 服务名称
   * @param {Function|Object} target - 服务类或实例
   * @returns {ServiceRegistration}
   */
  register(name, target) {
    const registration = new ServiceRegistration(name, target, this);
    this.services.set(name, registration);
    return registration;
  }

  /**
   * 注册服务（支持 fluent 链式调用）
   * @param {string} name - 服务名称
   * @param {Function|Object} target - 服务类或实例
   * @param {Object} options - 注册选项
   * @param {Object} [options.dependencies] - 依赖配置
   * @param {'singleton'|'prototype'} [options.lifecycle] - 生命周期模式
   * @param {Function} [options.factory] - 工厂函数
   * @returns {any} 服务实例或注册表
   */
  registerAs(name, target, options = {}) {
    const registration = new ServiceRegistration(name, target, this);
    this.services.set(name, registration);

    if (options.lifecycle) {
      registration.lifecycle = options.lifecycle;
    }
    if (options.dependencies) {
      registration.inject(options.dependencies);
    }
    if (options.factory) {
      registration.factoryFn = options.factory;
    }

    return registration;
  }

  /**
   * 解析服务
   * @param {string} name - 服务名称
   * @param {Object} [overrides] - 运行时覆盖参数
   * @returns {any}
   */
  resolve(name, overrides = {}) {
    // 循环依赖检测
    if (this.resolving.has(name)) {
      throw new Error(`[DI] Circular dependency detected: ${name}`);
    }

    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`[DI] Service not registered: ${name}`);
    }

    // 如果是单例且已实例化，直接返回
    if (registration.lifecycle === 'singleton' && this.instances.has(name)) {
      return this.instances.get(name);
    }

    this.resolving.add(name);

    try {
      let instance;

      if (registration.isInstance) {
        // 直接是实例
        instance = registration.target;
      } else if (registration.factoryFn) {
        // 工厂函数
        instance = registration.factoryFn(this, overrides);
      } else {
        // 类构造函数 - 注入依赖
        instance = this._resolveWithDependencies(registration, overrides);
      }

      // 单例缓存
      if (registration.lifecycle === 'singleton') {
        this.instances.set(name, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * 解析带依赖的实例
   * @private
   */
  _resolveWithDependencies(registration, overrides) {
    const { target, dependencies } = registration;
    const deps = {};

    for (const [depName, depConfig] of Object.entries(dependencies)) {
      if (overrides[depName] !== undefined) {
        // 运行时覆盖
        deps[depName] = overrides[depName];
      } else if (typeof depConfig === 'string') {
        // 引用其他服务
        deps[depName] = this.resolve(depConfig);
      } else if (depConfig.value !== undefined) {
        // 常量值
        deps[depName] = depConfig.value;
      } else if (depConfig.factory) {
        // 内联工厂
        deps[depName] = depConfig.factory(this);
      }
    }

    try {
      return new target(deps);
    } catch (error) {
      // 尝试 positional 参数注入作为后备
      const depValues = Object.values(deps);
      if (depValues.length > 0 && typeof target === 'function') {
        return new target(...depValues);
      }
      throw error;
    }
  }

  /**
   * 检查服务是否已注册
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * 清除所有实例（但不取消注册）
   */
  clearInstances() {
    this.instances.clear();
  }

  /**
   * 重置容器（清除所有注册和实例）
   */
  reset() {
    this.services.clear();
    this.instances.clear();
    this.resolving.clear();
    this.dependencyGraph.clear();
  }

  /**
   * 获取依赖图（用于分析）
   * @returns {Object}
   */
  getDependencyGraph() {
    const graph = {};

    for (const [name, reg] of this.services) {
      const deps = Object.keys(reg.dependencies).map(depName => {
        const depConfig = reg.dependencies[depName];
        return typeof depConfig === 'string' ? depConfig : depName;
      });

      graph[name] = {
        dependencies: deps,
        lifecycle: reg.lifecycle,
        isInstance: reg.isInstance,
      };
    }

    return graph;
  }

  /**
   * 验证依赖是否完整
   * @returns {{valid: boolean, missing: string[], circular: string[][]}}
   */
  validateDependencies() {
    const missing = [];
    const circular = [];

    for (const [name, registration] of this.services) {
      for (const [depName, depConfig] of Object.entries(registration.dependencies)) {
        if (typeof depConfig === 'string' && !this.services.has(depConfig)) {
          missing.push(`${name} -> ${depConfig}`);
        }
      }
    }

    // 检测循环依赖
    for (const name of this.services.keys()) {
      const cycle = this._detectCycle(name, new Set());
      if (cycle.length > 0) {
        circular.push(cycle);
      }
    }

    return {
      valid: missing.length === 0 && circular.length === 0,
      missing,
      circular,
    };
  }

  /**
   * 检测循环依赖
   * @private
   */
  _detectCycle(name, visited, path = []) {
    if (visited.has(name)) {
      return [...path, name];
    }

    const registration = this.services.get(name);
    if (!registration) return [];

    visited.add(name);
    path.push(name);

    for (const depName of Object.keys(registration.dependencies)) {
      const result = this._detectCycle(depName, new Set(visited), [...path]);
      if (result.length > 0) return result;
    }

    return [];
  }
}

/**
 * 服务注册构建器
 */
class ServiceRegistration {
  constructor(name, target, container) {
    this.name = name;
    this.target = target;
    this.container = container;
    /** @type {Object} 依赖配置 */
    this.dependencies = {};
    /** @type {'singleton'|'prototype'} 生命周期模式 */
    this.lifecycle = 'prototype';
    /** @type {Function|null} 工厂函数 */
    this.factoryFn = null;
    /** @type {boolean} 是否直接是实例 */
    this.isInstance = typeof target !== 'function';
  }

  /**
   * 设置为单例模式
   * @returns {ServiceRegistration}
   */
  singleton() {
    this.lifecycle = 'singleton';
    return this;
  }

  /**
   * 设置为原型模式（每次创建新实例）
   * @returns {ServiceRegistration}
   */
  prototype() {
    this.lifecycle = 'prototype';
    return this;
  }

  /**
   * 注入依赖
   * @param {Object} deps - 依赖配置 { paramName: serviceName | { value: any } | { factory: fn } }
   * @returns {ServiceRegistration}
   *
   * @example
   * // 引用其他服务
   * .inject({ modelClient: 'modelClient' })
   *
   * // 常量值
   * .inject({ timeout: { value: 5000 } })
   *
   * // 工厂函数
   * .inject({ logger: { factory: (container) => new Logger() } })
   */
  inject(deps) {
    this.dependencies = { ...this.dependencies, ...deps };
    return this;
  }

  /**
   * 使用工厂函数创建实例
   * @param {Function} factoryFn - 工厂函数，接收 (container, overrides)
   * @returns {ServiceRegistration}
   *
   * @example
   * .factory((container, overrides) => new MyService({
   *   client: container.resolve('client'),
   *   ...overrides
   * }))
   */
  factory(factoryFn) {
    this.factoryFn = factoryFn;
    return this;
  }

  /**
   * 获取工厂函数
   * @returns {Function|null}
   */
  getFactory() {
    return this.factoryFn;
  }
}

// 导出
module.exports = {
  DIContainer,
  ServiceRegistration,
};