/**
 * Domain Agent 模块导出
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { IntentRouter, RouteContext, RouteResult, ROUTE_TYPES, ROUTE_STRATEGY, ROUTE_PRIORITY, INTENT_TO_ROUTE } = require('./IntentRouter');
const { ContextAssembler, ContextItem, AssemblyConfig, DEFAULT_TOKEN_BUDGET, AVG_CHARS_PER_TOKEN } = require('./ContextAssembler');
const { ToolExecutor, ToolErrorType, createToolExecutor } = require('./ToolExecutor');
const { MCPToolExecutor, createMCPToolExecutor } = require('./MCPToolExecutor');
const { ToolResultMerger, MergeStrategy, ConflictResolution, createToolResultMerger } = require('./ToolResultMerger');
const { MCPToolRegistry, createMCPToolRegistry } = require('./MCPToolRegistry');
const { MCPParameterExtractor, createParameterExtractor } = require('./MCPParameterExtractor');
const { MCPToolIntegration, createMCPToolIntegration } = require('./MCPToolIntegration');

module.exports = {
  // IntentRouter - 意图路由
  IntentRouter,
  RouteContext,
  RouteResult,
  ROUTE_TYPES,
  ROUTE_STRATEGY,
  ROUTE_PRIORITY,
  INTENT_TO_ROUTE,

  // ContextAssembler - 上下文组装
  ContextAssembler,
  ContextItem,
  AssemblyConfig,
  DEFAULT_TOKEN_BUDGET,
  AVG_CHARS_PER_TOKEN,

  // ToolExecutor - 工具执行器
  ToolExecutor,
  ToolErrorType,
  createToolExecutor,

  // MCPToolExecutor - MCP协议执行器
  MCPToolExecutor,
  createMCPToolExecutor,

  // ToolResultMerger - 结果合并器
  ToolResultMerger,
  MergeStrategy,
  ConflictResolution,
  createToolResultMerger,

  // MCPToolRegistry - MCP工具自动发现注册表
  MCPToolRegistry,
  createMCPToolRegistry,

  // MCPParameterExtractor - MCP参数自动提取器
  MCPParameterExtractor,
  createParameterExtractor,

  // MCPToolIntegration - MCP工具集成模块
  MCPToolIntegration,
  createMCPToolIntegration
};
