/**
 * 工具模块导出
 * 统一导出所有内置工具
 */

export { ToolDefinition, ToolExecutionResult, ToolRecommendation, ToolResult } from './tool-registry.service';
export { createSearchTool } from './search.tool';
export { createWeatherTool } from './weather.tool';
export { createCalculatorTool } from './calculator.tool';
export { createEncyclopediaTool } from './encyclopedia.tool';

/**
 * 获取所有内置工具定义
 */
import { ToolDefinition } from './tool-registry.service';
import { createSearchTool } from './search.tool';
import { createWeatherTool } from './weather.tool';
import { createCalculatorTool } from './calculator.tool';
import { createEncyclopediaTool } from './encyclopedia.tool';

export function getBuiltinTools(): ToolDefinition[] {
  return [
    createSearchTool(),
    createWeatherTool(),
    createCalculatorTool(),
    createEncyclopediaTool()
  ];
}

/**
 * 注册所有内置工具到注册表
 */
export function registerBuiltinTools(registry: any): void {
  const tools = getBuiltinTools();
  for (const tool of tools) {
    registry.register(tool);
  }
}
