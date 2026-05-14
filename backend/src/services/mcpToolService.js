/**
 * MCP Tool Service - MCP工具注册表管理
 * 处理自定义工具的注册、更新、删除
 */
const fs = require('fs').promises;
const path = require('path');

const TOOL_REGISTRY_PATH = path.join(__dirname, '../../data/tool-registry.json');

/**
 * 加载工具注册表
 */
async function loadToolRegistry() {
  try {
    const data = await fs.readFile(TOOL_REGISTRY_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { tools: [], customTools: [] };
  }
}

/**
 * 保存工具注册表
 */
async function saveToolRegistry(registry) {
  const dir = path.dirname(TOOL_REGISTRY_PATH);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(TOOL_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (error) {
    console.error('[MCP] 保存工具注册表失败:', error.message);
  }
}

/**
 * 获取所有自定义工具
 */
async function getCustomTools() {
  const registry = await loadToolRegistry();
  return registry.customTools || [];
}

/**
 * 获取单个自定义工具
 */
async function getCustomTool(name) {
  const registry = await loadToolRegistry();
  return registry.customTools.find(t => t.name === name) || null;
}

/**
 * 注册新工具
 */
async function registerTool({ name, description, inputSchema, category = 'custom' }) {
  if (!name || !description || !inputSchema) {
    return { error: '缺少必填字段: name, description, inputSchema' };
  }

  const registry = await loadToolRegistry();

  // 检查是否已存在
  if (registry.customTools.some(t => t.name === name)) {
    return { error: `工具 ${name} 已存在` };
  }

  const newTool = {
    name,
    description,
    inputSchema,
    category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registry.customTools.push(newTool);
  await saveToolRegistry(registry);

  return { data: newTool };
}

/**
 * 更新工具
 */
async function updateTool(name, { description, inputSchema, category }) {
  const registry = await loadToolRegistry();
  const toolIndex = registry.customTools.findIndex(t => t.name === name);

  if (toolIndex === -1) {
    return { error: `自定义工具 ${name} 不存在` };
  }

  const updatedTool = {
    ...registry.customTools[toolIndex],
    description: description || registry.customTools[toolIndex].description,
    inputSchema: inputSchema || registry.customTools[toolIndex].inputSchema,
    category: category || registry.customTools[toolIndex].category,
    updatedAt: new Date().toISOString(),
  };

  registry.customTools[toolIndex] = updatedTool;
  await saveToolRegistry(registry);

  return { data: updatedTool };
}

/**
 * 删除工具
 */
async function deleteTool(name) {
  const registry = await loadToolRegistry();
  const toolIndex = registry.customTools.findIndex(t => t.name === name);

  if (toolIndex === -1) {
    return { error: `自定义工具 ${name} 不存在` };
  }

  registry.customTools.splice(toolIndex, 1);
  await saveToolRegistry(registry);

  return { success: true };
}

/**
 * 测试工具执行
 */
async function testTool(mcpService, mcpManager, toolName, args = {}, timeout = 30000) {
  // 查找工具schema
  let toolSchema = mcpManager.getToolSchema(toolName);

  if (!toolSchema) {
    const customTool = await getCustomTool(toolName);
    if (customTool) {
      toolSchema = {
        name: customTool.name,
        description: customTool.description,
        category: 'custom',
        inputSchema: customTool.inputSchema,
      };
    }
  }

  if (!toolSchema) {
    return { success: false, error: { code: 'NOT_FOUND', message: `工具 ${toolName} 不存在` } };
  }

  return await mcpService.executeWithTimeout(toolName, args, timeout);
}

module.exports = {
  loadToolRegistry,
  saveToolRegistry,
  getCustomTools,
  getCustomTool,
  registerTool,
  updateTool,
  deleteTool,
  testTool,
};