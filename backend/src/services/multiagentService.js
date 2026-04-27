/**
 * Multiagent 服务
 * 管理 Crew、Agent Engine 的生命周期和执行
 */

const { Agent, Task, Crew, AGENT_TEMPLATES, TASK_TEMPLATES } = require('../multiagent');
const MiniMaxChatClient = require('./model/clients/MiniMaxChatClient');

// ============================================
// 状态存储 (内存中)
// ============================================

// 活跃的 Crew 实例
const crews = new Map();

// 增强版引擎实例
const enhancedEngines = new Map();

// ============================================
// Crew 管理
// ============================================

/**
 * 创建 Crew
 */
function createCrew({ name, agents, tasks, process, verbose }) {
  const crew = new Crew({
    id: name ? `crew_${name}_${Date.now()}` : undefined,
    agents: agents || [],
    tasks: tasks || [],
    process: process || 'sequential',
    verbose: verbose || false
  });

  crews.set(crew.id, crew);
  return crew;
}

/**
 * 获取 Crew
 */
function getCrew(id) {
  return crews.get(id) || null;
}

/**
 * 获取所有 Crew
 */
function listCrews() {
  return Array.from(crews.values()).map(crew => crew.getStatus());
}

/**
 * 删除 Crew
 */
function deleteCrew(id) {
  if (!crews.has(id)) {
    return false;
  }
  crews.delete(id);
  return true;
}

// ============================================
// Agent Engine 管理
// ============================================

const { EnhancedAgentEngine } = require('./enhancedAgentEngine');

/**
 * 创建增强版 Agent 引擎
 */
function createEngine({ sessionId, options = {} }) {
  const engine = new EnhancedAgentEngine({
    sessionId: sessionId || `engine_${Date.now()}`,
    ...options
  });

  enhancedEngines.set(engine.sessionId, engine);
  return engine;
}

/**
 * 获取 Engine
 */
function getEngine(sessionId) {
  return enhancedEngines.get(sessionId) || null;
}

/**
 * 删除 Engine
 */
async function deleteEngine(sessionId) {
  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    return false;
  }

  await engine.cleanup();
  enhancedEngines.delete(sessionId);
  return true;
}

// ============================================
// LLM 客户端工厂
// ============================================

/**
 * 创建真实的 MiniMax LLM 客户端
 */
function createRealLLMClient() {
  const miniMaxClient = new MiniMaxChatClient();
  return {
    complete: async ({ prompt, agent, tools }) => {
      try {
        const response = await miniMaxClient.chat({
          messages: [{ role: 'user', content: prompt }],
          options: { temperature: 0.7 }
        });
        return response.content || '[无内容返回]';
      } catch (error) {
        console.error('[MultiagentService] LLM 调用失败:', error.message);
        return `[${agent?.role || 'Agent'}] 执行出错: ${error.message}`;
      }
    }
  };
}

// ============================================
// 执行逻辑
// ============================================

/**
 * 执行 Crew
 */
async function executeCrew({ crewId, agents, tasks, process }) {
  let crew;
  if (crewId && crews.has(crewId)) {
    crew = crews.get(crewId);
  } else {
    crew = new Crew({
      id: crewId || `crew_${Date.now()}`,
      agents: agents || [],
      tasks: tasks || [],
      process: process || 'sequential'
    });
    crews.set(crew.id, crew);
  }

  const realLLMClient = createRealLLMClient();
  return await crew.execute(realLLMClient);
}

/**
 * 使用增强引擎执行任务
 */
async function executeEngineTask(sessionId, task, context = {}) {
  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    throw new Error('Engine not found');
  }
  return await engine.execute(task, context);
}

/**
 * 从检查点恢复
 */
async function restoreFromCheckpoint(sessionId, checkpointId) {
  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    throw new Error('Engine not found');
  }
  return await engine.restoreFromCheckpoint(checkpointId);
}

// ============================================
// 工具系统
// ============================================

const { createDefaultToolRegistry } = require('./tools');

/**
 * 获取所有可用工具
 */
function listTools() {
  const registry = createDefaultToolRegistry();
  return registry.listTools();
}

/**
 * 执行工具
 */
async function executeTool(toolName, input, options = {}) {
  const registry = createDefaultToolRegistry();
  return await registry.executeTool(toolName, input, options);
}

// ============================================
// 健康检查
// ============================================

function getHealthStatus() {
  return {
    status: 'ok',
    service: 'multiagent',
    crews: crews.size,
    engines: enhancedEngines.size,
    timestamp: new Date().toISOString()
  };
}

// ============================================
// 导出
// ============================================

module.exports = {
  // Templates
  getTemplates: () => ({
    agentTemplates: AGENT_TEMPLATES,
    taskTemplates: TASK_TEMPLATES
  }),

  // Crew
  createCrew,
  getCrew,
  listCrews,
  deleteCrew,
  executeCrew,

  // Engine
  createEngine,
  getEngine,
  deleteEngine,
  executeEngineTask,
  restoreFromCheckpoint,

  // LLM
  createRealLLMClient,

  // Tools
  listTools,
  executeTool,

  // Health
  getHealthStatus,

  // Constants
  AGENT_TEMPLATES,
  TASK_TEMPLATES
};