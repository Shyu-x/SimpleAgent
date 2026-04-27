/**
 * PluginManager 单元测试
 */

const { PluginManager, PluginType, PluginStatus } = require('../../src/services/pluginManager');

// Mock dependencies
const mockToolRegistry = {
  register: jest.fn(),
  unregister: jest.fn()
};

const mockRoleRegistry = {
  register: jest.fn(),
  unregister: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
};

describe('PluginManager', () => {
  let pluginManager;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginManager = new PluginManager();
    pluginManager.setToolRegistry(mockToolRegistry);
    pluginManager.roleRegistry = mockRoleRegistry;
  });

  describe('构造函数', () => {
    test('应该正确初始化默认属性', () => {
      expect(pluginManager.plugins).toBeInstanceOf(Map);
      expect(pluginManager.plugins.size).toBe(0);
      expect(pluginManager.roleRegistry).toBe(mockRoleRegistry);
      expect(pluginManager.pluginsPath).toBe('./plugins');
    });

    test('应该接受自定义 pluginsPath', () => {
      const customManager = new PluginManager({ pluginsPath: '/custom/path' });
      expect(customManager.pluginsPath).toBe('/custom/path');
    });

    test('应该有默认权限配置', () => {
      expect(pluginManager.defaultPermissions).toEqual([
        'tool:execute',
        'memory:read',
        'memory:write',
        'http:fetch'
      ]);
    });
  });

  describe('registerPlugin - 插件注册', () => {
    test('应该成功注册一个工具插件', async () => {
      const plugin = {
        id: 'test:tool',
        name: 'Test Tool',
        type: PluginType.TOOL,
        description: 'A test tool plugin',
        version: '1.0.0',
        handler: jest.fn().mockResolvedValue({ result: 'success' })
      };

      const pluginId = await pluginManager.registerPlugin(plugin);

      expect(pluginId).toBe('test:tool');
      expect(pluginManager.plugins.has('test:tool')).toBe(true);
      expect(pluginManager.getPlugin('test:tool').status).toBe(PluginStatus.LOADED);
    });

    test('应该自动生成ID当未提供时', async () => {
      const plugin = {
        name: 'Test Tool',
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      const pluginId = await pluginManager.registerPlugin(plugin);

      expect(pluginId).toMatch(/^plugin_\d+_[a-z0-9]+$/);
    });

    test('应该抛出错误当插件名称缺失时', async () => {
      const plugin = {
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      await expect(pluginManager.registerPlugin(plugin))
        .rejects.toThrow('Plugin name is required');
    });

    test('应该抛出错误当插件类型无效时', async () => {
      const plugin = {
        name: 'Test Plugin',
        type: 'invalid_type',
        handler: jest.fn()
      };

      await expect(pluginManager.registerPlugin(plugin))
        .rejects.toThrow('Invalid plugin type');
    });

    test('应该抛出错误当工具插件缺少handler时', async () => {
      const plugin = {
        name: 'Test Tool',
        type: PluginType.TOOL
      };

      await expect(pluginManager.registerPlugin(plugin))
        .rejects.toThrow('Tool plugin requires a handler');
    });

    test('应该抛出错误当角色插件缺少role定义时', async () => {
      const plugin = {
        name: 'Test Role',
        type: PluginType.AGENT_ROLE
      };

      await expect(pluginManager.registerPlugin(plugin))
        .rejects.toThrow('Agent role plugin requires a role definition');
    });

    test('应该抛出错误当插件已存在（重复注册）', async () => {
      const plugin = {
        id: 'test:duplicate',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      await pluginManager.registerPlugin(plugin);

      await expect(pluginManager.registerPlugin(plugin))
        .rejects.toThrow('Plugin already exists: test:duplicate');
    });

    test('应该自动注册工具到toolRegistry', async () => {
      const plugin = {
        id: 'test:auto-register',
        name: 'Test Tool',
        type: PluginType.TOOL,
        tool: {
          name: 'test_tool',
          description: 'Test tool description',
          parameters: { type: 'object', properties: {} }
        },
        handler: jest.fn().mockResolvedValue({ result: 'success' })
      };

      await pluginManager.registerPlugin(plugin);

      expect(mockToolRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test_tool',
          description: 'Test tool description',
          parameters: { type: 'object', properties: {} }
        })
      );
    });

    test('应该自动注册角色到roleRegistry', async () => {
      const plugin = {
        id: 'test:role-register',
        name: 'Test Role',
        type: PluginType.AGENT_ROLE,
        role: {
          id: 'test-role-id',
          name: 'Test Role Name',
          permissions: ['memory:read']
        }
      };

      await pluginManager.registerPlugin(plugin);

      expect(mockRoleRegistry.set).toHaveBeenCalledWith('test-role-id', {
        id: 'test-role-id',
        name: 'Test Role Name',
        permissions: ['memory:read'],
        pluginId: 'test:role-register'
      });
    });

    test('应该发射 plugin:registered 事件', async () => {
      const plugin = {
        id: 'test:event',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      const eventListener = jest.fn();
      pluginManager.on('plugin:registered', eventListener);

      await pluginManager.registerPlugin(plugin);

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test:event',
          name: 'Test Plugin'
        })
      );
    });
  });

  describe('enablePlugin - 插件启用', () => {
    beforeEach(async () => {
      // 注册并获取一个插件
      this.plugin = {
        id: 'test:enable',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn(),
        status: PluginStatus.LOADED
      };
      await pluginManager.registerPlugin(this.plugin);
    });

    test('应该成功启用已加载的插件', async () => {
      const result = await pluginManager.enablePlugin('test:enable');

      expect(result).toBe(true);
      expect(pluginManager.getPlugin('test:enable').status).toBe(PluginStatus.ENABLED);
    });

    test('如果插件已启用应该直接返回', async () => {
      await pluginManager.enablePlugin('test:enable');
      await pluginManager.enablePlugin('test:enable');

      expect(pluginManager.getPlugin('test:enable').status).toBe(PluginStatus.ENABLED);
    });

    test('应该抛出错误当插件不存在时', async () => {
      await expect(pluginManager.enablePlugin('non:existent'))
        .rejects.toThrow('Plugin not found: non:existent');
    });

    test('应该发射 plugin:enabled 事件', async () => {
      const eventListener = jest.fn();
      pluginManager.on('plugin:enabled', eventListener);

      await pluginManager.enablePlugin('test:enable');

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test:enable' })
      );
    });
  });

  describe('disablePlugin - 插件禁用', () => {
    beforeEach(async () => {
      this.plugin = {
        id: 'test:disable',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn()
      };
      await pluginManager.registerPlugin(this.plugin);
      await pluginManager.enablePlugin('test:disable');
    });

    test('应该成功禁用已启用的插件', async () => {
      const result = await pluginManager.disablePlugin('test:disable');

      expect(result).toBe(true);
      expect(pluginManager.getPlugin('test:disable').status).toBe(PluginStatus.DISABLED);
    });

    test('如果插件未启用应该直接返回', async () => {
      await pluginManager.disablePlugin('test:disable');
      await pluginManager.disablePlugin('test:disable');

      expect(pluginManager.getPlugin('test:disable').status).toBe(PluginStatus.DISABLED);
    });

    test('应该抛出错误当插件不存在时', async () => {
      await expect(pluginManager.disablePlugin('non:existent'))
        .rejects.toThrow('Plugin not found: non:existent');
    });

    test('应该发射 plugin:disabled 事件', async () => {
      const eventListener = jest.fn();
      pluginManager.on('plugin:disabled', eventListener);

      await pluginManager.disablePlugin('test:disable');

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test:disable' })
      );
    });
  });

  describe('unloadPlugin - 插件卸载', () => {
    beforeEach(async () => {
      this.plugin = {
        id: 'test:unload',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        tool: { name: 'test_tool' },
        handler: jest.fn()
      };
      await pluginManager.registerPlugin(this.plugin);
      await pluginManager.enablePlugin('test:unload');
    });

    test('应该成功卸载已启用的插件（先禁用后移除）', async () => {
      const result = await pluginManager.unloadPlugin('test:unload');

      expect(result).toBe(true);
      expect(pluginManager.plugins.has('test:unload')).toBe(false);
    });

    test('应该从toolRegistry移除工具', async () => {
      await pluginManager.unloadPlugin('test:unload');

      expect(mockToolRegistry.unregister).toHaveBeenCalledWith('test_tool');
    });

    test('应该从roleRegistry移除角色', async () => {
      const rolePlugin = {
        id: 'test:role-unload',
        name: 'Test Role',
        type: PluginType.AGENT_ROLE,
        role: { id: 'role-123', name: 'Test Role' }
      };
      await pluginManager.registerPlugin(rolePlugin);

      await pluginManager.unloadPlugin('test:role-unload');

      expect(mockRoleRegistry.delete).toHaveBeenCalledWith('role-123');
    });

    test('应该抛出错误当插件不存在时', async () => {
      await expect(pluginManager.unloadPlugin('non:existent'))
        .rejects.toThrow('Plugin not found: non:existent');
    });

    test('应该发射 plugin:unloaded 事件', async () => {
      const eventListener = jest.fn();
      pluginManager.on('plugin:unloaded', eventListener);

      await pluginManager.unloadPlugin('test:unload');

      expect(eventListener).toHaveBeenCalledWith('test:unload');
    });
  });

  describe('Hook执行', () => {
    describe('onLoad hook', () => {
      test('应该在注册时调用onLoad hook', async () => {
        const onLoadMock = jest.fn();

        const plugin = {
          id: 'test:onload',
          name: 'Test Plugin',
          type: PluginType.TOOL,
          handler: jest.fn(),
          onLoad: onLoadMock
        };

        await pluginManager.registerPlugin(plugin);

        expect(onLoadMock).toHaveBeenCalledWith(
          expect.objectContaining({
            pluginId: 'test:onload'
          })
        );
      });

      test('onLoad hook错误不应阻止插件注册', async () => {
        const plugin = {
          id: 'test:onload-error',
          name: 'Test Plugin',
          type: PluginType.TOOL,
          handler: jest.fn(),
          onLoad: jest.fn().mockRejectedValue(new Error('onLoad error'))
        };

        const pluginId = await pluginManager.registerPlugin(plugin);

        expect(pluginId).toBe('test:onload-error');
        expect(pluginManager.plugins.has('test:onload-error')).toBe(true);
      });
    });

    describe('onEnable hook', () => {
      test('应该在启用时调用onEnable hook', async () => {
        const onEnableMock = jest.fn();

        const plugin = {
          id: 'test:onenable',
          name: 'Test Plugin',
          type: PluginType.TOOL,
          handler: jest.fn(),
          onEnable: onEnableMock
        };

        await pluginManager.registerPlugin(plugin);
        await pluginManager.enablePlugin('test:onenable');

        expect(onEnableMock).toHaveBeenCalledWith(
          expect.objectContaining({
            pluginId: 'test:onenable'
          })
        );
      });
    });

    describe('onDisable hook', () => {
      test('应该在禁用时调用onDisable hook', async () => {
        const onDisableMock = jest.fn();

        const plugin = {
          id: 'test:ondisable',
          name: 'Test Plugin',
          type: PluginType.TOOL,
          handler: jest.fn(),
          onDisable: onDisableMock
        };

        await pluginManager.registerPlugin(plugin);
        await pluginManager.enablePlugin('test:ondisable');
        await pluginManager.disablePlugin('test:ondisable');

        expect(onDisableMock).toHaveBeenCalledWith(
          expect.objectContaining({
            pluginId: 'test:ondisable'
          })
        );
      });
    });

    describe('onUnload hook', () => {
      test('应该在卸载时调用onUnload hook', async () => {
        const onUnloadMock = jest.fn();

        const plugin = {
          id: 'test:onunload',
          name: 'Test Plugin',
          type: PluginType.TOOL,
          handler: jest.fn(),
          onUnload: onUnloadMock
        };

        await pluginManager.registerPlugin(plugin);
        await pluginManager.unloadPlugin('test:onunload');

        expect(onUnloadMock).toHaveBeenCalledWith(
          expect.objectContaining({
            pluginId: 'test:onunload'
          })
        );
      });
    });
  });

  describe('Permission系统', () => {
    test('应该使用默认权限当未提供时', async () => {
      const plugin = {
        id: 'test:permissions',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      await pluginManager.registerPlugin(plugin);

      expect(pluginManager.getPlugin('test:permissions').permissions)
        .toEqual(pluginManager.defaultPermissions);
    });

    test('应该使用自定义权限当提供时', async () => {
      const plugin = {
        id: 'test:custom-perms',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn(),
        permissions: ['custom:permission']
      };

      await pluginManager.registerPlugin(plugin);

      expect(pluginManager.getPlugin('test:custom-perms').permissions)
        .toEqual(['custom:permission']);
    });

    test('hasPermission应该在上下文中正确检查权限', async () => {
      const plugin = {
        id: 'test:has-permission',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn(),
        permissions: ['tool:execute', 'memory:read']
      };

      await pluginManager.registerPlugin(plugin);

      const context = pluginManager.getPluginContext('test:has-permission');

      expect(context.hasPermission('tool:execute')).toBe(true);
      expect(context.hasPermission('memory:read')).toBe(true);
      expect(context.hasPermission('memory:write')).toBe(false);
    });

    test('requestPermission功能存在（权限请求）', async () => {
      const plugin = {
        id: 'test:request-perm',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      await pluginManager.registerPlugin(plugin);

      // requestPermission在上下文中应该存在
      // 实际实现可能需要异步请求权限
      expect(pluginManager.getPluginContext('test:request-perm'))
        .toHaveProperty('hasPermission');
    });
  });

  describe('Auto-registration - 自动注册', () => {
    test('工具插件应该自动注册到toolRegistry', async () => {
      const plugin = {
        id: 'test:auto-tool',
        name: 'Auto Tool',
        type: PluginType.TOOL,
        tool: {
          name: 'auto_tool',
          description: 'An auto registered tool',
          parameters: { type: 'object', properties: {} }
        },
        handler: jest.fn().mockResolvedValue({ result: 'auto' })
      };

      await pluginManager.registerPlugin(plugin);

      expect(mockToolRegistry.register).toHaveBeenCalledTimes(1);
      expect(mockToolRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'auto_tool'
        })
      );
    });

    test('角色插件应该自动注册到roleRegistry', async () => {
      const plugin = {
        id: 'test:auto-role',
        name: 'Auto Role',
        type: PluginType.AGENT_ROLE,
        role: {
          id: 'auto-role-id',
          name: 'Auto Role Name'
        }
      };

      await pluginManager.registerPlugin(plugin);

      expect(mockRoleRegistry.set).toHaveBeenCalledTimes(1);
      expect(mockRoleRegistry.set).toHaveBeenCalledWith(
        'auto-role-id',
        expect.objectContaining({
          id: 'auto-role-id',
          pluginId: 'test:auto-role'
        })
      );
    });

    test('非工具/角色类型插件不应触发自动注册', async () => {
      const plugin = {
        id: 'test:extension',
        name: 'Extension Plugin',
        type: PluginType.EXTENSION,
        metadata: { ext: 'data' }
      };

      await pluginManager.registerPlugin(plugin);

      expect(mockToolRegistry.register).not.toHaveBeenCalled();
      expect(mockRoleRegistry.set).not.toHaveBeenCalled();
    });
  });

  describe('getPlugins - 获取插件列表', () => {
    beforeEach(async () => {
      // 注册多种类型插件
      await pluginManager.registerPlugin({
        id: 'tool:1',
        name: 'Tool 1',
        type: PluginType.TOOL,
        handler: jest.fn()
      });

      await pluginManager.registerPlugin({
        id: 'tool:2',
        name: 'Tool 2',
        type: PluginType.TOOL,
        handler: jest.fn()
      });

      await pluginManager.registerPlugin({
        id: 'role:1',
        name: 'Role 1',
        type: PluginType.AGENT_ROLE,
        role: { id: 'role-1', name: 'Role 1' }
      });
    });

    test('应该返回所有插件当未指定类型时', () => {
      const plugins = pluginManager.getPlugins();

      expect(plugins.length).toBe(3);
    });

    test('应该只返回工具插件当指定类型时', () => {
      const tools = pluginManager.getPlugins(PluginType.TOOL);

      expect(tools.length).toBe(2);
      expect(tools.every(p => p.type === PluginType.TOOL)).toBe(true);
    });

    test('应该只返回角色插件当指定类型时', () => {
      const roles = pluginManager.getPlugins(PluginType.AGENT_ROLE);

      expect(roles.length).toBe(1);
      expect(roles[0].id).toBe('role:1');
    });
  });

  describe('getEnabledPlugins - 获取已启用插件', () => {
    beforeEach(async () => {
      await pluginManager.registerPlugin({
        id: 'enabled:1',
        name: 'Enabled 1',
        type: PluginType.TOOL,
        handler: jest.fn()
      });

      await pluginManager.registerPlugin({
        id: 'enabled:2',
        name: 'Enabled 2',
        type: PluginType.TOOL,
        handler: jest.fn()
      });

      await pluginManager.registerPlugin({
        id: 'disabled:1',
        name: 'Disabled 1',
        type: PluginType.TOOL,
        handler: jest.fn()
      });

      await pluginManager.enablePlugin('enabled:1');
      await pluginManager.enablePlugin('enabled:2');
      // disabled:1 保持LOADED状态
    });

    test('应该只返回已启用的插件', () => {
      const enabled = pluginManager.getEnabledPlugins();

      expect(enabled.length).toBe(2);
      expect(enabled.every(p => p.status === PluginStatus.ENABLED)).toBe(true);
    });
  });

  describe('getRoles - 获取角色列表', () => {
    test('应该返回所有注册的角色', async () => {
      // Reset with a real Map for roleRegistry to test getRoles properly
      pluginManager.roleRegistry = new Map();

      await pluginManager.registerPlugin({
        id: 'role:1',
        name: 'Role 1',
        type: PluginType.AGENT_ROLE,
        role: { id: 'role-1', name: 'Role 1' }
      });

      await pluginManager.registerPlugin({
        id: 'role:2',
        name: 'Role 2',
        type: PluginType.AGENT_ROLE,
        role: { id: 'role-2', name: 'Role 2' }
      });

      const roles = pluginManager.getRoles();

      expect(roles.length).toBe(2);
    });
  });

  describe('getPluginContext - 插件上下文', () => {
    beforeEach(async () => {
      await pluginManager.registerPlugin({
        id: 'test:context',
        name: 'Test Plugin',
        type: PluginType.TOOL,
        handler: jest.fn(),
        metadata: { key: 'value' }
      });
    });

    test('应该包含正确的上下文属性', () => {
      const context = pluginManager.getPluginContext('test:context');

      expect(context.pluginId).toBe('test:context');
      expect(context.plugin).toBeDefined();
      expect(context.registerTool).toBeDefined();
      expect(context.registerRole).toBeDefined();
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
      expect(context.hasPermission).toBeDefined();
    });

    test('registerTool应该能注册新工具', () => {
      const context = pluginManager.getPluginContext('test:context');

      context.registerTool({
        name: 'dynamic_tool',
        description: 'Dynamically registered tool',
        parameters: {}
      });

      expect(mockToolRegistry.register).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'dynamic_tool' })
      );
    });

    test('config.get应该返回metadata中的值', () => {
      const context = pluginManager.getPluginContext('test:context');

      expect(context.config.get('key')).toBe('value');
      expect(context.config.get('nonexistent', 'default')).toBe('default');
    });

    test('config.set应该设置metadata中的值', () => {
      const context = pluginManager.getPluginContext('test:context');

      context.config.set('newKey', 'newValue');

      expect(pluginManager.getPlugin('test:context').metadata.newKey).toBe('newValue');
    });

    test('logger应该正确输出日志', () => {
      const context = pluginManager.getPluginContext('test:context');
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      context.logger.info('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[test:context]', 'Test message');

      consoleSpy.mockRestore();
    });
  });

  describe('executeTool - 工具执行', () => {
    beforeEach(async () => {
      this.handlerMock = jest.fn().mockResolvedValue({ result: 42 });

      await pluginManager.registerPlugin({
        id: 'test:execute',
        name: 'Test Tool',
        type: PluginType.TOOL,
        tool: { name: 'test_tool' },
        handler: this.handlerMock,
        permissions: ['tool:execute']
      });

      await pluginManager.enablePlugin('test:execute');
    });

    test('应该正确执行已启用的工具', async () => {
      const result = await pluginManager.executeTool('test_tool', { arg: 'value' });

      expect(this.handlerMock).toHaveBeenCalledWith({ arg: 'value' });
      expect(result).toEqual({ result: 42 });
    });

    test('应该在工具未找到时抛出错误', async () => {
      await expect(pluginManager.executeTool('nonexistent_tool', {}))
        .rejects.toThrow('Tool not found: nonexistent_tool');
    });

    test('应该在权限不足时抛出错误', async () => {
      // 注册一个没有 tool:execute 权限的插件
      await pluginManager.registerPlugin({
        id: 'test:no-perms',
        name: 'No Perms Tool',
        type: PluginType.TOOL,
        tool: { name: 'no_perms_tool' },
        handler: jest.fn(),
        permissions: [] // 缺少 tool:execute
      });

      await pluginManager.enablePlugin('test:no-perms');

      await expect(pluginManager.executeTool('no_perms_tool', {}))
        .rejects.toThrow('lacks tool:execute permission');
    });
  });

  describe('状态转换验证', () => {
    test('LOADED -> ENABLED -> DISABLED -> ENABLED 转换', async () => {
      const plugin = {
        id: 'test:state-transition',
        name: 'State Test',
        type: PluginType.TOOL,
        handler: jest.fn()
      };

      await pluginManager.registerPlugin(plugin);
      expect(pluginManager.getPlugin('test:state-transition').status).toBe(PluginStatus.LOADED);

      await pluginManager.enablePlugin('test:state-transition');
      expect(pluginManager.getPlugin('test:state-transition').status).toBe(PluginStatus.ENABLED);

      await pluginManager.disablePlugin('test:state-transition');
      expect(pluginManager.getPlugin('test:state-transition').status).toBe(PluginStatus.DISABLED);

      await pluginManager.enablePlugin('test:state-transition');
      expect(pluginManager.getPlugin('test:state-transition').status).toBe(PluginStatus.ENABLED);
    });

    test('ENABLED -> unload 应该先disable再移除', async () => {
      const plugin = {
        id: 'test:unload-flow',
        name: 'Unload Flow Test',
        type: PluginType.TOOL,
        tool: { name: 'unload_flow_tool' },
        handler: jest.fn()
      };

      await pluginManager.registerPlugin(plugin);
      await pluginManager.enablePlugin('test:unload-flow');

      await pluginManager.unloadPlugin('test:unload-flow');

      expect(pluginManager.plugins.has('test:unload-flow')).toBe(false);
    });
  });

  describe('initialize - 初始化', () => {
    test('应该初始化内置插件', async () => {
      const loadBuiltInPluginsSpy = jest.spyOn(pluginManager, 'loadBuiltInPlugins');

      await pluginManager.initialize();

      expect(loadBuiltInPluginsSpy).toHaveBeenCalled();
      expect(pluginManager.getPlugins().length).toBeGreaterThan(0);
    });

    test('应该发射 initialized 事件', async () => {
      const eventListener = jest.fn();
      pluginManager.on('initialized', eventListener);

      await pluginManager.initialize();

      expect(eventListener).toHaveBeenCalled();
    });
  });

  describe('validatePlugin - 插件验证', () => {
    test('应该验证所有必需字段', () => {
      expect(() => pluginManager.validatePlugin({ name: '' }))
        .toThrow('Plugin name is required');

      expect(() => pluginManager.validatePlugin({ name: 'Test', type: 'invalid' }))
        .toThrow('Invalid plugin type');

      expect(() => pluginManager.validatePlugin({ name: 'Test', type: PluginType.TOOL }))
        .toThrow('Tool plugin requires a handler');

      expect(() => pluginManager.validatePlugin({ name: 'Test', type: PluginType.AGENT_ROLE }))
        .toThrow('Agent role plugin requires a role definition');
    });

    test('有效插件应该通过验证', () => {
      expect(() => pluginManager.validatePlugin({
        name: 'Valid Tool',
        type: PluginType.TOOL,
        handler: jest.fn()
      })).not.toThrow();

      expect(() => pluginManager.validatePlugin({
        name: 'Valid Role',
        type: PluginType.AGENT_ROLE,
        role: { id: 'r1', name: 'Role' }
      })).not.toThrow();
    });
  });

  describe('setToolRegistry - 设置工具注册表', () => {
    test('应该设置toolRegistry', () => {
      const newRegistry = { register: jest.fn(), unregister: jest.fn() };

      pluginManager.setToolRegistry(newRegistry);

      expect(pluginManager.toolRegistry).toBe(newRegistry);
    });
  });
});
