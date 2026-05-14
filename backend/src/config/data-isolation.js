/**
 * 数据隔离配置
 * =============
 *
 * 支持分库分表策略和读写分离
 *
 * 设计目标：
 * 1. 按业务模块隔离数据，减少耦合
 * 2. 支持分表策略，应对数据量增长
 * 3. 读写分离提升性能
 * 4. 数据访问层抽象，支持多数据源
 *
 * @module config/data-isolation
 * @version 1.0.0
 */

const { createLogger } = require('../infra/logger/AgentLogger');
const logger = createLogger('DataIsolation');

/**
 * 数据库配置
 * @typedef {Object} DatabaseConfig
 * @property {string} name - 连接名称
 * @property {string} type - 数据库类型
 * @property {string} host - 主机地址
 * @property {number} port - 端口号
 * @property {string} database - 数据库名
 * @property {string} username - 用户名
 * @property {string} password - 密码
 * @property {boolean} isPrimary - 是否为主库
 * @property {number} [poolSize] - 连接池大小
 */

/**
 * 分表策略配置
 * @typedef {Object} ShardingStrategy
 * @property {string} name - 策略名称
 * @property {string} shardingKey - 分表字段
 * @property {string} algorithm - 分表算法
 * @property {number} shardCount - 分表数量
 */

/**
 * 路由上下文
 * @typedef {Object} RoutingContext
 * @property {string} [tenantId] - 当前租户ID
 * @property {string} [userId] - 当前用户ID
 * @property {string} [module] - 模块标识
 */

class DataRouterService {
  constructor() {
    /** @type {Map<string, DatabaseConfig>} */
    this.routingRules = new Map();
    /** @type {Map<string, ShardingStrategy>} */
    this.shardingStrategies = new Map();
    /** @type {Map<string, any>} */
    this.dataSources = new Map();

    this._initializeRoutingRules();
    this._initializeShardingStrategies();

    logger.info('数据路由服务初始化完成');
  }

  /**
   * 初始化路由规则
   * 将不同模块路由到不同数据库
   * @private
   */
  _initializeRoutingRules() {
    // 用户模块 - 使用 user_db
    this.routingRules.set('module-user', {
      name: 'user_db',
      type: 'mysql',
      host: process.env.DB_USER_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_USER_PORT || process.env.DB_PORT || '3306'),
      database: process.env.DB_USER_NAME || 'user_db',
      username: process.env.DB_USER_USER || process.env.DB_USER || 'root',
      password: process.env.DB_USER_PASSWORD || process.env.DB_PASSWORD || 'password',
      isPrimary: true,
    });

    // 订单模块 - 使用 order_db
    this.routingRules.set('module-order', {
      name: 'order_db',
      type: 'mysql',
      host: process.env.DB_ORDER_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_ORDER_PORT || process.env.DB_PORT || '3306'),
      database: process.env.DB_ORDER_NAME || 'order_db',
      username: process.env.DB_ORDER_USER || process.env.DB_USER || 'root',
      password: process.env.DB_ORDER_PASSWORD || process.env.DB_PASSWORD || 'password',
      isPrimary: true,
    });

    // 支付模块 - 使用 payment_db
    this.routingRules.set('module-payment', {
      name: 'payment_db',
      type: 'mysql',
      host: process.env.DB_PAYMENT_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PAYMENT_PORT || process.env.DB_PORT || '3306'),
      database: process.env.DB_PAYMENT_NAME || 'payment_db',
      username: process.env.DB_PAYMENT_USER || process.env.DB_USER || 'root',
      password: process.env.DB_PAYMENT_PASSWORD || process.env.DB_PASSWORD || 'password',
      isPrimary: true,
    });

    // 默认库（公共数据）
    this.routingRules.set('default', {
      name: 'default_db',
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      database: process.env.DB_NAME || 'default_db',
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      isPrimary: true,
    });
  }

  /**
   * 初始化分片策略
   * @private
   */
  _initializeShardingStrategies() {
    // 订单按月分表
    this.shardingStrategies.set('orders', {
      name: 'orders_monthly',
      shardingKey: 'created_at',
      algorithm: 'range',
      shardCount: 12,
    });

    // 用户按ID哈希分表
    this.shardingStrategies.set('users', {
      name: 'users_by_id',
      shardingKey: 'id',
      algorithm: 'hash',
      shardCount: 16,
    });

    // 会话按周分表
    this.shardingStrategies.set('sessions', {
      name: 'sessions_weekly',
      shardingKey: 'updated_at',
      algorithm: 'range',
      shardCount: 52,
    });
  }

  /**
   * 获取数据源配置
   * @param {string} module - 模块名称
   * @param {RoutingContext} [context] - 路由上下文
   * @returns {DatabaseConfig}
   */
  getDataSourceConfig(module, context) {
    let config = this.routingRules.get(module);

    if (!config && context?.tenantId) {
      config = this.routingRules.get(`tenant_${context.tenantId}`);
    }

    if (!config) {
      config = this.routingRules.get('default');
      logger.warn(`模块 ${module} 无特定数据源，使用默认配置`);
    }

    return config;
  }

  /**
   * 获取分表后的表名
   * @param {string} tableName - 原表名
   * @param {string} strategy - 策略名称
   * @param {*} shardingValue - 分片字段值
   * @returns {string}
   */
  getShardedTableName(tableName, strategy, shardingValue) {
    const strategyConfig = this.shardingStrategies.get(strategy);

    if (!strategyConfig) {
      logger.warn(`未找到分片策略 ${strategy}，返回原表名`);
      return tableName;
    }

    const { algorithm, shardCount } = strategyConfig;

    switch (algorithm) {
      case 'hash':
        const hash = this._hashCode(String(shardingValue));
        const hashShard = Math.abs(hash) % shardCount;
        return `${tableName}_${hashShard.toString().padStart(2, '0')}`;

      case 'range':
        const date = new Date(String(shardingValue));
        const month = date.getMonth() + 1;
        return `${tableName}_${month.toString().padStart(2, '0')}`;

      case 'mod':
        const numValue = Number(shardingValue);
        const modShard = numValue % shardCount;
        return `${tableName}_${modShard.toString().padStart(2, '0')}`;

      default:
        return tableName;
    }
  }

  /**
   * 计算哈希值
   * @private
   * @param {string} str - 输入字符串
   * @returns {number}
   */
  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * 判断是否使用读库
   * @param {boolean} isWrite - 是否是写操作
   * @param {RoutingContext} [context] - 路由上下文
   * @returns {boolean}
   */
  shouldUseReadReplica(isWrite, context) {
    if (isWrite) return false;
    if (context?.module === 'finance') return false;
    return true;
  }

  /**
   * 获取路由统计信息
   * @returns {{ totalRules: number, activeShards: number, modules: string[] }}
   */
  getRoutingStats() {
    return {
      totalRules: this.routingRules.size,
      activeShards: this.shardingStrategies.size,
      modules: Array.from(this.routingRules.keys()),
    };
  }

  /**
   * 获取所有路由规则
   * @returns {Object[]}
   */
  getAllRoutingRules() {
    return Array.from(this.routingRules.entries()).map(([module, config]) => ({
      module,
      ...config,
    }));
  }

  /**
   * 获取所有分片策略
   * @returns {Object[]}
   */
  getAllShardingStrategies() {
    return Array.from(this.shardingStrategies.entries()).map(([name, strategy]) => ({
      name,
      ...strategy,
    }));
  }

  /**
   * 添加自定义路由规则
   * @param {string} module - 模块名称
   * @param {DatabaseConfig} config - 数据库配置
   */
  addRoutingRule(module, config) {
    this.routingRules.set(module, { ...config, name: module });
    logger.info(`添加路由规则: ${module}`);
  }

  /**
   * 添加自定义分片策略
   * @param {string} name - 策略名称
   * @param {ShardingStrategy} strategy - 分片策略
   */
  addShardingStrategy(name, strategy) {
    this.shardingStrategies.set(name, strategy);
    logger.info(`添加分片策略: ${name}`);
  }

  /**
   * 获取模块对应的数据库信息
   * @param {string} module - 模块名称
   * @returns {{ dbName: string, tableName: string, shardInfo: string }[]}
   */
  getModuleDatabaseInfo(module) {
    const config = this.getDataSourceConfig(module);
    const shards = [];

    for (const [strategyName, strategy] of this.shardingStrategies.entries()) {
      shards.push({
        strategyName,
        shardCount: strategy.shardCount,
        algorithm: strategy.algorithm,
      });
    }

    return [{
      module,
      dbName: config.database,
      dbType: config.type,
      isPrimary: config.isPrimary,
      shards,
    }];
  }
}

// 单例导出
const dataRouter = new DataRouterService();

module.exports = dataRouter;
module.exports.DataRouterService = DataRouterService;