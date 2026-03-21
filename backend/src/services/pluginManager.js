/**
 * 插件管理器
 * 管理工具插件和角色插件的加载、卸载和生命周期
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// 插件类型
const PluginType = {
  TOOL: 'tool',
  AGENT_ROLE: 'agent_role',
  EXTENSION: 'extension'
};

// 插件状态
const PluginStatus = {
  UNLOADED: 'unloaded',
  LOADED: 'loaded',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  ERROR: 'error'
};

// 生成ID
const generateId = () => 'plugin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.plugins = new Map();
    this.toolRegistry = null;
    this.roleRegistry = new Map();
    this.pluginsPath = options.pluginsPath || './plugins';

    // 权限配置
    this.permissions = new Map();

    // 默认权限
    this.defaultPermissions = [
      'tool:execute',
      'memory:read',
      'memory:write',
      'http:fetch'
    ];
  }

  /**
   * 初始化插件管理器
   */
  async initialize(options = {}) {
    this.pluginsPath = options.pluginsPath || this.pluginsPath;

    // 确保插件目录存在
    if (!fs.existsSync(this.pluginsPath)) {
      fs.mkdirSync(this.pluginsPath, { recursive: true });
    }

    // 加载内置插件
    await this.loadBuiltInPlugins();

    this.emit('initialized');
    return this;
  }

  /**
   * 加载内置插件
   */
  async loadBuiltInPlugins() {
    // 工具插件 - 复用现有的工具注册
    const toolPlugins = this.getBuiltInToolPlugins();
    for (const plugin of toolPlugins) {
      await this.registerPlugin(plugin);
    }
  }

  /**
   * 获取内置工具插件
   */
  getBuiltInToolPlugins() {
    return [
      {
        id: 'builtin:websearch',
        name: 'Web Search',
        type: PluginType.TOOL,
        description: '搜索互联网获取信息',
        version: '1.0.0',
        tool: {
          name: 'web_search',
          description: '搜索互联网',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' }
            },
            required: ['query']
          }
        },
        handler: async (args) => {
          // 实际实现在webSearchTool中
          return { results: [], query: args.query };
        }
      },
      {
        id: 'builtin:calculator',
        name: 'Calculator',
        type: PluginType.TOOL,
        description: '数学计算工具',
        version: '1.0.0',
        tool: {
          name: 'calculator',
          description: '执行数学计算',
          parameters: {
            type: 'object',
            properties: {
              expression: { type: 'string', description: '数学表达式' }
            },
            required: ['expression']
          }
        },
        handler: async (args) => {
          try {
            // 安全计算：只允许数字和运算符
            const expr = args.expression.replace(/[^0-9+\-*/.() ]/g, '');
            const result = Function(`"use strict"; return (${expr})`)();
            return { result };
          } catch (e) {
            return { error: e.message };
          }
        }
      }
    ];
  }

  /**
   * 注册插件
   */
  async registerPlugin(plugin) {
    const pluginId = plugin.id || generateId();

    // 检查是否已存在
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin already exists: ${pluginId}`);
    }

    // 验证插件
    this.validatePlugin(plugin);

    // 创建插件实例
    const pluginInstance = {
      id: pluginId,
      name: plugin.name,
      type: plugin.type,
      description: plugin.description || '',
      version: plugin.version || '1.0.0',
      author: plugin.author || 'Unknown',
      status: PluginStatus.LOADED,
      metadata: plugin.metadata || {},
      permissions: plugin.permissions || this.defaultPermissions,

      // 工具插件特定
      tool: plugin.tool || null,
      handler: plugin.handler || null,

      // 角色插件特定
      role: plugin.role || null,

      // 生命周期钩子
      hooks: {
        onLoad: plugin.onLoad || null,
        onEnable: plugin.onEnable || null,
        onDisable: plugin.onDisable || null,
        onUnload: plugin.onUnload || null
      },

      // 加载时间
      loadedAt: Date.now()
    };

    // 存储插件
    this.plugins.set(pluginId, pluginInstance);

    // 执行onLoad钩子
    if (pluginInstance.hooks.onLoad) {
      try {
        await pluginInstance.hooks.onLoad(this.getPluginContext(pluginId));
      } catch (error) {
        console.error(`Plugin ${pluginId} onLoad error:`, error);
      }
    }

    // 如果是工具插件，自动注册到工具注册表
    if (pluginInstance.type === PluginType.TOOL && pluginInstance.tool && this.toolRegistry) {
      this.toolRegistry.register({
        name: pluginInstance.tool.name,
        description: pluginInstance.tool.description,
        parameters: pluginInstance.tool.parameters,
        execute: async (args) => {
          return await pluginInstance.handler(args);
        }
      });
    }

    // 如果是角色插件，添加到角色注册表
    if (pluginInstance.type === PluginType.AGENT_ROLE && pluginInstance.role) {
      this.roleRegistry.set(pluginInstance.role.id, {
        ...pluginInstance.role,
        pluginId
      });
    }

    this.emit('plugin:registered', pluginInstance);
    return pluginId;
  }

  /**
   * 验证插件
   */
  validatePlugin(plugin) {
    if (!plugin.name) {
      throw new Error('Plugin name is required');
    }

    if (!plugin.type || !Object.values(PluginType).includes(plugin.type)) {
      throw new Error('Invalid plugin type');
    }

    if (plugin.type === PluginType.TOOL && !plugin.handler) {
      throw new Error('Tool plugin requires a handler');
    }

    if (plugin.type === PluginType.AGENT_ROLE && !plugin.role) {
      throw new Error('Agent role plugin requires a role definition');
    }
  }

  /**
   * 启用插件
   */
  async enablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (plugin.status === PluginStatus.ENABLED) {
      return;
    }

    plugin.status = PluginStatus.ENABLED;

    if (plugin.hooks.onEnable) {
      await plugin.hooks.onEnable(this.getPluginContext(pluginId));
    }

    this.emit('plugin:enabled', plugin);
    return true;
  }

  /**
   * 禁用插件
   */
  async disablePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    if (plugin.status !== PluginStatus.ENABLED) {
      return;
    }

    plugin.status = PluginStatus.DISABLED;

    if (plugin.hooks.onDisable) {
      await plugin.hooks.onDisable(this.getPluginContext(pluginId));
    }

    this.emit('plugin:disabled', plugin);
    return true;
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }

    // 如果启用，先禁用
    if (plugin.status === PluginStatus.ENABLED) {
      await this.disablePlugin(pluginId);
    }

    // 从工具注册表移除
    if (plugin.type === PluginType.TOOL && plugin.tool && this.toolRegistry) {
      this.toolRegistry.unregister(plugin.tool.name);
    }

    // 从角色注册表移除
    if (plugin.type === PluginType.AGENT_ROLE && plugin.role) {
      this.roleRegistry.delete(plugin.role.id);
    }

    // 执行onUnload钩子
    if (plugin.hooks.onUnload) {
      await plugin.hooks.onUnload(this.getPluginContext(pluginId));
    }

    this.plugins.delete(pluginId);
    this.emit('plugin:unloaded', pluginId);
    return true;
  }

  /**
   * 获取插件上下文
   */
  getPluginContext(pluginId) {
    const plugin = this.plugins.get(pluginId);

    return {
      pluginId,
      plugin,

      // 工具注册表
      registerTool: (tool) => {
        if (this.toolRegistry) {
          this.toolRegistry.register(tool);
        }
      },

      // 角色注册
      registerRole: (role) => {
        this.roleRegistry.set(role.id, role);
      },

      // 配置
      config: {
        get: (key, defaultValue) => {
          return plugin?.metadata?.[key] ?? defaultValue;
        },
        set: (key, value) => {
          if (plugin) {
            plugin.metadata[key] = value;
          }
        }
      },

      // 日志
      logger: {
        debug: (...args) => console.debug(`[${pluginId}]`, ...args),
        info: (...args) => console.info(`[${pluginId}]`, ...args),
        warn: (...args) => console.warn(`[${pluginId}]`, ...args),
        error: (...args) => console.error(`[${pluginId}]`, ...args)
      },

      // 权限检查
      hasPermission: (permission) => {
        return plugin?.permissions?.includes(permission) ?? false;
      }
    };
  }

  /**
   * 设置工具注册表
   */
  setToolRegistry(registry) {
    this.toolRegistry = registry;
  }

  /**
   * 获取插件列表
   */
  getPlugins(type = null) {
    const plugins = Array.from(this.plugins.values());

    if (type) {
      return plugins.filter(p => p.type === type);
    }

    return plugins;
  }

  /**
   * 获取启用的插件
   */
  getEnabledPlugins() {
    return Array.from(this.plugins.values())
      .filter(p => p.status === PluginStatus.ENABLED);
  }

  /**
   * 获取角色列表
   */
  getRoles() {
    return Array.from(this.roleRegistry.values());
  }

  /**
   * 获取插件信息
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId);
  }

  /**
   * 执行工具插件
   */
  async executeTool(toolName, args) {
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.type === PluginType.TOOL && plugin.tool?.name === toolName) {
        // 权限检查
        if (!plugin.permissions.includes('tool:execute')) {
          throw new Error(`Plugin ${plugin.id} lacks tool:execute permission`);
        }

        return await plugin.handler(args);
      }
    }

    throw new Error(`Tool not found: ${toolName}`);
  }
}

module.exports = {
  PluginManager,
  PluginType,
  PluginStatus
};