/**
 * 工具注册表服务
 * 处理工具的持久化和查询
 */

const fs = require('fs').promises;
const path = require('path');

const TOOL_REGISTRY_PATH = path.join(__dirname, '../data/tool-registry.json');

class ToolRegistryService {
  /** 加载工具注册表 */
  async load() {
    try {
      const data = await fs.readFile(TOOL_REGISTRY_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { tools: [], customTools: [] };
    }
  }

  /** 保存工具注册表 */
  async save(registry) {
    const dir = path.dirname(TOOL_REGISTRY_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(TOOL_REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  }

  /** 获取所有自定义工具 */
  async getCustomTools() {
    const registry = await this.load();
    return registry.customTools || [];
  }

  /** 查找自定义工具 */
  async findCustomTool(name) {
    const registry = await this.load();
    return registry.customTools.find(t => t.name === name);
  }

  /** 添加自定义工具 */
  async addTool(tool) {
    const registry = await this.load();
    registry.customTools.push(tool);
    await this.save(registry);
    return tool;
  }

  /** 更新自定义工具 */
  async updateTool(name, updates) {
    const registry = await this.load();
    const idx = registry.customTools.findIndex(t => t.name === name);
    if (idx === -1) return null;
    registry.customTools[idx] = { ...registry.customTools[idx], ...updates, updatedAt: new Date().toISOString() };
    await this.save(registry);
    return registry.customTools[idx];
  }

  /** 删除自定义工具 */
  async deleteTool(name) {
    const registry = await this.load();
    const idx = registry.customTools.findIndex(t => t.name === name);
    if (idx === -1) return false;
    registry.customTools.splice(idx, 1);
    await this.save(registry);
    return true;
  }
}

module.exports = new ToolRegistryService();
