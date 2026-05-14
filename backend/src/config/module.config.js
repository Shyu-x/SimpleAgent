/**
 * 模块配置管理器
 * ==============
 *
 * 职责：
 * 1. 模块启用/禁用控制
 * 2. 模块依赖关系检查
 * 3. 启动顺序编排
 * 4. 模块健康状态监控
 *
 * 设计理念：
 * - 通过配置控制模块行为，无需修改代码
 * - 支持运行时动态切换模块状态
 * - 自动检测循环依赖和缺失依赖
 *
 * @module config/module.config
 * @version 1.0.0
 */

const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('ModuleConfig');

/**
 * 模块状态枚举
 */
const ModuleStatus = {
  PENDING: 'pending',
  INITIALIZING: 'initializing',
  READY: 'ready',
  FAILED: 'failed',
  DISABLED: 'disabled',
};

/**
 * 模块依赖配置
 * @typedef {Object} ModuleDependency
 * @property {string} moduleName - 依赖模块名称
 * @property {string} [minVersion] - 最低版本要求
 * @property {boolean} required - 是否必需依赖
 */

/**
 * 模块元数据配置
 * @typedef {Object} ModuleMetadata
 * @property {string} name - 模块唯一标识
 * @property {string} displayName - 模块显示名称
 * @property {string} version - 模块版本
 * @property {string} [description] - 模块描述
 * @property {boolean} enabled - 是否启用
 * @property {ModuleDependency[]} dependencies - 依赖的其他模块
 * @property {number} startupPriority - 启动优先级（数值越小越先启动）
 * @property {string} [healthCheckPath] - 健康检查端点
 * @property {Object} [config] - 模块配置项
 */

class ModuleConfigService {
  constructor() {
    this.modules = new Map();
    this.moduleStatuses = new Map();
    this._initializeDefaultModules();
  }

  /**
   * 初始化默认模块配置
   * @private
   */
  _initializeDefaultModules() {
    const defaultModules = [
      {
        name: 'module-user',
        displayName: '用户模块',
        version: '1.0.0',
        description: '用户注册、登录、权限管理',
        enabled: true,
        dependencies: [],
        startupPriority: 10,
        healthCheckPath: '/health/user',
        config: {
          port: process.env.MODULE_USER_PORT || 3001,
          db: process.env.DB_USER_NAME || 'user_db',
        },
      },
      {
        name: 'module-order',
        displayName: '订单模块',
        version: '1.0.0',
        description: '订单创建、查询、状态管理',
        enabled: true,
        dependencies: [
          { moduleName: 'module-user', required: true },
        ],
        startupPriority: 20,
        healthCheckPath: '/health/order',
        config: {
          port: process.env.MODULE_ORDER_PORT || 3002,
          db: process.env.DB_ORDER_NAME || 'order_db',
        },
      },
      {
        name: 'module-payment',
        displayName: '支付模块',
        version: '1.0.0',
        description: '支付通道、交易流水、退款',
        enabled: true,
        dependencies: [
          { moduleName: 'module-order', required: true },
          { moduleName: 'module-user', required: true },
        ],
        startupPriority: 30,
        healthCheckPath: '/health/payment',
        config: {
          port: process.env.MODULE_PAYMENT_PORT || 3003,
          db: process.env.DB_PAYMENT_NAME || 'payment_db',
        },
      },
    ];

    defaultModules.forEach((module) => {
      this.registerModule(module);
    });

    logger.info('模块配置服务初始化完成');
  }

  /**
   * 注册模块配置
   * @param {ModuleMetadata} metadata - 模块元数据
   */
  registerModule(metadata) {
    if (this.modules.has(metadata.name)) {
      logger.warn(`模块 ${metadata.name} 已存在，将被覆盖`);
    }

    this.modules.set(metadata.name, metadata);
    this.moduleStatuses.set(
      metadata.name,
      metadata.enabled ? ModuleStatus.PENDING : ModuleStatus.DISABLED,
    );
    logger.info(`注册模块: ${metadata.name} (优先级: ${metadata.startupPriority})`);
  }

  /**
   * 获取所有模块配置
   * @returns {ModuleMetadata[]}
   */
  getAllModules() {
    return Array.from(this.modules.values());
  }

  /**
   * 获取单个模块配置
   * @param {string} name - 模块名称
   * @returns {ModuleMetadata|undefined}
   */
  getModule(name) {
    return this.modules.get(name);
  }

  /**
   * 获取启用的模块列表（按启动顺序排序）
   * @returns {ModuleMetadata[]}
   */
  getEnabledModules() {
    return this.getAllModules()
      .filter((m) => m.enabled)
      .sort((a, b) => a.startupPriority - b.startupPriority);
  }

  /**
   * 检查模块是否启用
   * @param {string} name - 模块名称
   * @returns {boolean}
   */
  isModuleEnabled(name) {
    const module = this.modules.get(name);
    return module?.enabled ?? false;
  }

  /**
   * 启用模块
   * @param {string} name - 模块名称
   * @returns {boolean} 是否成功启用
   */
  async enableModule(name) {
    const module = this.modules.get(name);
    if (!module) {
      logger.error(`模块 ${name} 不存在`);
      return false;
    }

    const depsSatisfied = this.checkDependencies(name);
    if (!depsSatisfied) {
      logger.error(`模块 ${name} 的依赖未满足，无法启用`);
      return false;
    }

    module.enabled = true;
    this.moduleStatuses.set(name, ModuleStatus.PENDING);
    logger.info(`模块 ${name} 已启用`);
    return true;
  }

  /**
   * 禁用模块
   * @param {string} name - 模块名称
   */
  disableModule(name) {
    const module = this.modules.get(name);
    if (!module) {
      logger.error(`模块 ${name} 不存在`);
      return;
    }

    const dependents = this.getDependents(name);
    if (dependents.length > 0) {
      logger.warn(`模块 ${name} 被以下模块依赖: ${dependents.join(', ')}`);
      logger.warn('强制禁用可能导致依赖模块故障');
    }

    module.enabled = false;
    this.moduleStatuses.set(name, ModuleStatus.DISABLED);
    logger.info(`模块 ${name} 已禁用`);
  }

  /**
   * 获取模块状态
   * @param {string} name - 模块名称
   * @returns {string}
   */
  getModuleStatus(name) {
    return this.moduleStatuses.get(name) ?? ModuleStatus.PENDING;
  }

  /**
   * 更新模块状态
   * @param {string} name - 模块名称
   * @param {string} status - 模块状态
   */
  updateModuleStatus(name, status) {
    this.moduleStatuses.set(name, status);
    logger.info(`模块 ${name} 状态更新为: ${status}`);
  }

  /**
   * 验证依赖关系
   * 检查循环依赖和缺失依赖
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateDependencies() {
    const errors = [];

    for (const [name, module] of this.modules.entries()) {
      if (!module.enabled) continue;

      for (const dep of module.dependencies) {
        if (!this.modules.has(dep.moduleName)) {
          errors.push(`模块 ${name} 依赖 ${dep.moduleName}，但该模块不存在`);
        } else if (!this.modules.get(dep.moduleName)?.enabled) {
          if (dep.required) {
            errors.push(`模块 ${name} 必需依赖 ${dep.moduleName}，但该模块已禁用`);
          }
        }
      }
    }

    const cycleErrors = this.detectCircularDependencies();
    errors.push(...cycleErrors);

    if (errors.length > 0) {
      logger.error('依赖验证失败:');
      errors.forEach((e) => logger.error(`  - ${e}`));
      return { valid: false, errors };
    }

    logger.info('模块依赖验证通过');
    return { valid: true, errors: [] };
  }

  /**
   * 检测循环依赖 (DFS)
   * @returns {string[]}
   */
  detectCircularDependencies() {
    const errors = [];
    const visited = new Set();
    const recStack = new Set();

    const dfs = (moduleName, path) => {
      visited.add(moduleName);
      recStack.add(moduleName);

      const module = this.modules.get(moduleName);
      if (!module) return false;

      for (const dep of module.dependencies) {
        const depName = dep.moduleName;

        if (!visited.has(depName)) {
          if (dfs(depName, [...path, depName])) {
            return true;
          }
        } else if (recStack.has(depName)) {
          errors.push(`检测到循环依赖: ${[...path, depName].join(' -> ')}`);
          return true;
        }
      }

      recStack.delete(moduleName);
      return false;
    };

    for (const name of this.modules.keys()) {
      if (!visited.has(name)) {
        dfs(name, [name]);
      }
    }

    return errors;
  }

  /**
   * 检查模块依赖是否满足
   * @param {string} moduleName - 模块名称
   * @returns {boolean}
   */
  checkDependencies(moduleName) {
    const module = this.modules.get(moduleName);
    if (!module) return false;

    for (const dep of module.dependencies) {
      const depModule = this.modules.get(dep.moduleName);
      if (!depModule) return false;
      if (!depModule.enabled) return false;
    }

    return true;
  }

  /**
   * 获取依赖此模块的所有模块
   * @param {string} moduleName - 模块名称
   * @returns {string[]}
   */
  getDependents(moduleName) {
    const dependents = [];

    for (const [name, module] of this.modules.entries()) {
      if (module.dependencies.some((d) => d.moduleName === moduleName)) {
        dependents.push(name);
      }
    }

    return dependents;
  }

  /**
   * 打印模块启动顺序
   */
  logStartupOrder() {
    const enabledModules = this.getEnabledModules();
    logger.info('=== 模块启动顺序 ===');
    enabledModules.forEach((m, index) => {
      logger.info(`${index + 1}. ${m.displayName} (${m.name}) - 优先级 ${m.startupPriority}`);
    });
    logger.info('====================');
  }

  /**
   * 获取模块健康状态摘要
   * @returns {{ name: string, status: string }[]}
   */
  getHealthSummary() {
    return Array.from(this.moduleStatuses.entries()).map(([name, status]) => ({
      name,
      status,
    }));
  }

  /**
   * 获取模块依赖图
   * @returns {{ nodes: Array, edges: Array }}
   */
  getDependencyGraph() {
    const nodes = [];
    const edges = [];

    for (const [name, module] of this.modules.entries()) {
      nodes.push({
        id: name,
        label: module.displayName,
        priority: module.startupPriority,
        enabled: module.enabled,
      });

      for (const dep of module.dependencies) {
        edges.push({
          from: dep.moduleName,
          to: name,
          type: dep.required ? 'hard' : 'soft',
        });
      }
    }

    return { nodes, edges };
  }
}

// 单例导出
const moduleConfig = new ModuleConfigService();

module.exports = moduleConfig;
module.exports.ModuleConfigService = ModuleConfigService;
module.exports.ModuleStatus = ModuleStatus;