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
 */

import {
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';

/**
 * 模块依赖配置
 */
export interface ModuleDependency {
  /** 依赖模块名称 */
  moduleName: string;
  /** 最低版本要求 */
  minVersion?: string;
  /** 是否必需（true=硬依赖，false=软依赖） */
  required: boolean;
}

/**
 * 模块元数据配置
 */
export interface ModuleMetadata {
  /** 模块唯一标识 */
  name: string;
  /** 模块显示名称 */
  displayName: string;
  /** 模块版本 */
  version: string;
  /** 模块描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 依赖的其他模块 */
  dependencies: ModuleDependency[];
  /** 启动优先级（数值越小越先启动） */
  startupPriority: number;
  /** 健康检查端点 */
  healthCheckPath?: string;
  /** 模块配置项 */
  config?: Record<string, unknown>;
}

/**
 * 模块启动状态
 */
export enum ModuleStatus {
  PENDING = 'pending',           // 等待启动
  INITIALIZING = 'initializing', // 初始化中
  READY = 'ready',               // 就绪
  FAILED = 'failed',             // 启动失败
  DISABLED = 'disabled',         // 已禁用
}

@Injectable()
export class ModuleConfigService implements OnModuleInit {
  private readonly logger = new Logger(ModuleConfigService.name);
  private modules = new Map<string, ModuleMetadata>();
  private moduleStatuses = new Map<string, ModuleStatus>();

  constructor() {
    this.initializeDefaultModules();
  }

  onModuleInit() {
    this.logger.log('模块配置服务初始化完成');
    this.validateDependencies();
    this.logStartupOrder();
  }

  /**
   * 初始化默认模块配置
   */
  private initializeDefaultModules(): void {
    const defaultModules: ModuleMetadata[] = [
      {
        name: 'module-user',
        displayName: '用户模块',
        version: '1.0.0',
        description: '用户注册、登录、权限管理',
        enabled: true,
        dependencies: [],
        startupPriority: 10, // 最先启动
        healthCheckPath: '/health/user',
      },
      {
        name: 'module-order',
        displayName: '订单模块',
        version: '1.0.0',
        description: '订单创建、查询、状态管理',
        enabled: true,
        dependencies: [
          { moduleName: 'module-user', required: true }, // 硬依赖用户模块
        ],
        startupPriority: 20,
        healthCheckPath: '/health/order',
      },
      {
        name: 'module-payment',
        displayName: '支付模块',
        version: '1.0.0',
        description: '支付通道、交易流水、退款',
        enabled: true,
        dependencies: [
          { moduleName: 'module-order', required: true },  // 硬依赖订单
          { moduleName: 'module-user', required: true },   // 硬依赖用户
        ],
        startupPriority: 30,
        healthCheckPath: '/health/payment',
      },
    ];

    defaultModules.forEach((module) => {
      this.registerModule(module);
    });
  }

  /**
   * 注册模块配置
   */
  registerModule(metadata: ModuleMetadata): void {
    if (this.modules.has(metadata.name)) {
      this.logger.warn(`模块 ${metadata.name} 已存在，将被覆盖`);
    }
    this.modules.set(metadata.name, metadata);
    this.moduleStatuses.set(metadata.name, metadata.enabled ? ModuleStatus.PENDING : ModuleStatus.DISABLED);
    this.logger.log(`注册模块: ${metadata.name} (优先级: ${metadata.startupPriority})`);
  }

  /**
   * 获取所有模块配置
   */
  getAllModules(): ModuleMetadata[] {
    return Array.from(this.modules.values());
  }

  /**
   * 获取单个模块配置
   */
  getModule(name: string): ModuleMetadata | undefined {
    return this.modules.get(name);
  }

  /**
   * 获取启用的模块列表（按启动顺序排序）
   */
  getEnabledModules(): ModuleMetadata[] {
    return this.getAllModules()
      .filter((m) => m.enabled)
      .sort((a, b) => a.startupPriority - b.startupPriority);
  }

  /**
   * 检查模块是否启用
   */
  isModuleEnabled(name: string): boolean {
    const module = this.modules.get(name);
    return module?.enabled ?? false;
  }

  /**
   * 启用模块
   */
  async enableModule(name: string): Promise<boolean> {
    const module = this.modules.get(name);
    if (!module) {
      this.logger.error(`模块 ${name} 不存在`);
      return false;
    }

    // 检查依赖是否满足
    const depsSatisfied = this.checkDependencies(name);
    if (!depsSatisfied) {
      this.logger.error(`模块 ${name} 的依赖未满足，无法启用`);
      return false;
    }

    module.enabled = true;
    this.moduleStatuses.set(name, ModuleStatus.PENDING);
    this.logger.log(`模块 ${name} 已启用`);
    return true;
  }

  /**
   * 禁用模块
   */
  disableModule(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      this.logger.error(`模块 ${name} 不存在`);
      return;
    }

    // 检查是否有其他模块依赖此模块
    const dependents = this.getDependents(name);
    if (dependents.length > 0) {
      this.logger.warn(`模块 ${name} 被以下模块依赖: ${dependents.join(', ')}`);
      this.logger.warn('强制禁用可能导致依赖模块故障');
    }

    module.enabled = false;
    this.moduleStatuses.set(name, ModuleStatus.DISABLED);
    this.logger.log(`模块 ${name} 已禁用`);
  }

  /**
   * 获取模块状态
   */
  getModuleStatus(name: string): ModuleStatus {
    return this.moduleStatuses.get(name) ?? ModuleStatus.PENDING;
  }

  /**
   * 更新模块状态
   */
  updateModuleStatus(name: string, status: ModuleStatus): void {
    this.moduleStatuses.set(name, status);
    this.logger.log(`模块 ${name} 状态更新为: ${status}`);
  }

  /**
   * 验证依赖关系
   * 检查循环依赖和缺失依赖
   */
  validateDependencies(): void {
    const errors: string[] = [];

    for (const [name, module] of this.modules.entries()) {
      if (!module.enabled) continue;

      // 检查依赖是否存在
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

    // 检测循环依赖
    const cycleErrors = this.detectCircularDependencies();
    errors.push(...cycleErrors);

    if (errors.length > 0) {
      this.logger.error('依赖验证失败:');
      errors.forEach((e) => this.logger.error(`  - ${e}`));
      throw new Error(`模块依赖验证失败: ${errors.join('; ')}`);
    }

    this.logger.log('模块依赖验证通过');
  }

  /**
   * 检测循环依赖
   * 使用深度优先搜索
   */
  private detectCircularDependencies(): string[] {
    const errors: string[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (moduleName: string, path: string[]): boolean => {
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
   */
  private checkDependencies(moduleName: string): boolean {
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
   */
  private getDependents(moduleName: string): string[] {
    const dependents: string[] = [];

    for (const [name, module] of this.modules.entries()) {
      if (module.dependencies.some((d) => d.moduleName === moduleName)) {
        dependents.push(name);
      }
    }

    return dependents;
  }

  /**
   * 打印启动顺序日志
   */
  private logStartupOrder(): void {
    const enabledModules = this.getEnabledModules();
    this.logger.log('=== 模块启动顺序 ===');
    enabledModules.forEach((m, index) => {
      this.logger.log(`${index + 1}. ${m.displayName} (${m.name}) - 优先级 ${m.startupPriority}`);
    });
    this.logger.log('====================');
  }

  /**
   * 获取模块健康状态摘要
   */
  getHealthSummary(): { name: string; status: ModuleStatus }[] {
    return Array.from(this.moduleStatuses.entries()).map(([name, status]) => ({
      name,
      status,
    }));
  }
}