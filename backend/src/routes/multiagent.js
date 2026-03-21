const express = require('express');
const router = express.Router();
const { Agent, Task, Crew, AGENT_TEMPLATES, TASK_TEMPLATES } = require('../multiagent');
const AgentEngine = require('../services/agentEngine');
const { EnhancedAgentEngine, CheckpointManager, DualMemorySystem } = require('../services/enhancedAgentEngine');
const { EnhancedMemoryService, MemoryType, MemoryPriority } = require('../services/enhancedMemory');
const { EnhancedToolRegistry, PermissionLevel } = require('../services/enhancedToolRegistry');
const { ErrorCodes, RetryStrategy, RecoveryManager } = require('../services/errorHandler');
const { createDefaultToolRegistry } = require('../services/tools');

// 存储活跃的 Crew 实例
const crews = new Map();

// 存储活跃的 Agent 执行引擎
const agentEngines = new Map();

// 增强版引擎实例
const enhancedEngines = new Map();

// 恢复管理器实例
const recoveryManager = new RecoveryManager();

/**
 * 获取 Agent 模板
 * GET /api/multiagent/templates
 */
router.get('/templates', (req, res) => {
  res.json({
    success: true,
    agentTemplates: AGENT_TEMPLATES,
    taskTemplates: TASK_TEMPLATES
  });
});

/**
 * 创建 Agent
 * POST /api/multiagent/agent
 */
router.post('/agent', (req, res) => {
  const { role, goal, backstory, tools, provider, model } = req.body;

  if (!role || !goal) {
    return res.status(400).json({ success: false, error: 'Missing role or goal' });
  }

  try {
    const agent = new Agent({
      role,
      goal,
      backstory: backstory || '',
      tools: tools || [],
      provider,
      model
    });

    res.json({
      success: true,
      agent: {
        id: agent.id,
        role: agent.role,
        goal: agent.goal,
        backstory: agent.backstory,
        tools: agent.tools
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建 Task
 * POST /api/multiagent/task
 */
router.post('/task', (req, res) => {
  const { description, expectedOutput, agentId, context, tools } = req.body;

  if (!description) {
    return res.status(400).json({ success: false, error: 'Missing description' });
  }

  try {
    const task = new Task({
      description,
      expectedOutput,
      agent: agentId ? { id: agentId } : null,
      context: context || [],
      tools: tools || []
    });

    res.json({
      success: true,
      task: {
        id: task.id,
        description: task.description,
        expectedOutput: task.expectedOutput
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建 Crew
 * POST /api/multiagent/crew
 */
router.post('/crew', (req, res) => {
  const { name, agents, tasks, process, verbose } = req.body;

  try {
    const crew = new Crew({
      id: name ? `crew_${name}_${Date.now()}` : undefined,
      agents: agents || [],
      tasks: tasks || [],
      process: process || 'sequential',
      verbose: verbose || false
    });

    crews.set(crew.id, crew);

    res.json({
      success: true,
      crew: crew.getStatus()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行 Crew
 * POST /api/multiagent/execute
 */
router.post('/execute', async (req, res) => {
  const { crewId, agents, tasks, process, llmConfig } = req.body;

  try {
    // 如果没有现有 crew，创建新的
    let crew;
    if (crewId && crews.has(crewId)) {
      crew = crews.get(crewId);
    } else {
      // 从请求参数创建
      crew = new Crew({
        id: crewId || `crew_${Date.now()}`,
        agents: agents || [],
        tasks: tasks || [],
        process: process || 'sequential'
      });
      crews.set(crew.id, crew);
    }

    // 模拟 LLM 调用（实际需要集成真实的 LLM）
    const mockLLMClient = {
      complete: async ({ prompt, agent, tools }) => {
        // 模拟响应
        return `[${agent?.role || 'Agent'}] Processed: ${prompt.substring(0, 100)}...`;
      }
    };

    const result = await crew.execute(mockLLMClient);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 Crew 状态
 * GET /api/multiagent/crew/:id
 */
router.get('/crew/:id', (req, res) => {
  const { id } = req.params;

  const crew = crews.get(id);
  if (!crew) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }

  res.json({
    success: true,
    crew: crew.getStatus()
  });
});

/**
 * 列出所有 Crew
 * GET /api/multiagent/crews
 */
router.get('/crews', (req, res) => {
  const crewList = [];
  crews.forEach((crew, id) => {
    crewList.push(crew.getStatus());
  });

  res.json({
    success: true,
    crews: crewList,
    count: crewList.length
  });
});

/**
 * 删除 Crew
 * DELETE /api/multiagent/crew/:id
 */
router.delete('/crew/:id', (req, res) => {
  const { id } = req.params;

  if (!crews.has(id)) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }

  crews.delete(id);
  res.json({ success: true, message: 'Crew deleted' });
});

/**
 * 健康检查
 * GET /api/multiagent/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'multiagent',
    crews: crews.size,
    engines: agentEngines.size,
    enhancedEngines: enhancedEngines.size,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 增强版 Agent 执行引擎 API
// ============================================

/**
 * 创建增强版 Agent 引擎
 * POST /api/multiagent/engine
 */
router.post('/engine', async (req, res) => {
  const { sessionId, options = {} } = req.body;

  try {
    const engine = new EnhancedAgentEngine({
      sessionId: sessionId || `engine_${Date.now()}`,
      ...options
    });

    enhancedEngines.set(engine.sessionId, engine);

    res.json({
      success: true,
      engine: {
        sessionId: engine.sessionId,
        state: engine.getState()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行任务（使用增强引擎）
 * POST /api/multiagent/engine/:sessionId/execute
 */
router.post('/engine/:sessionId/execute', async (req, res) => {
  const { sessionId } = req.params;
  const { task, context = {} } = req.body;

  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  try {
    const result = await engine.execute(task, context);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取引擎状态
 * GET /api/multiagent/engine/:sessionId
 */
router.get('/engine/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  res.json({ success: true, state: engine.getState() });
});

/**
 * 暂停引擎
 * POST /api/multiagent/engine/:sessionId/pause
 */
router.post('/engine/:sessionId/pause', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  engine.pause();
  res.json({ success: true, message: 'Engine paused' });
});

/**
 * 恢复引擎
 * POST /api/multiagent/engine/:sessionId/resume
 */
router.post('/engine/:sessionId/resume', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  engine.resume();
  res.json({ success: true, message: 'Engine resumed' });
});

/**
 * 获取检查点列表
 * GET /api/multiagent/engine/:sessionId/checkpoints
 */
router.get('/engine/:sessionId/checkpoints', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  const checkpoints = engine.checkpointManager.list(sessionId);
  res.json({ success: true, checkpoints });
});

/**
 * 从检查点恢复
 * POST /api/multiagent/engine/:sessionId/restore
 */
router.post('/engine/:sessionId/restore', async (req, res) => {
  const { sessionId } = req.params;
  const { checkpointId } = req.body;

  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  try {
    const result = await engine.restoreFromCheckpoint(checkpointId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 响应人机协作确认
 * POST /api/multiagent/engine/:sessionId/confirm
 */
router.post('/engine/:sessionId/confirm', (req, res) => {
  const { sessionId } = req.params;
  const { confirmationId, approved, modifiedInput } = req.body;

  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  const result = engine.respondToConfirmation(confirmationId, approved, modifiedInput);
  res.json(result);
});

/**
 * 获取记忆状态
 * GET /api/multiagent/engine/:sessionId/memory
 */
router.get('/engine/:sessionId/memory', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  const stats = engine.memory.getStats();
  res.json({ success: true, memory: stats });
});

/**
 * 搜索记忆
 * POST /api/multiagent/engine/:sessionId/memory/search
 */
router.post('/engine/:sessionId/memory/search', async (req, res) => {
  const { sessionId } = req.params;
  const { query, options = {} } = req.body;

  const engine = enhancedEngines.get(sessionId);
  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  const results = await engine.memory.search(query, options);
  res.json({ success: true, results });
});

/**
 * 删除引擎
 * DELETE /api/multiagent/engine/:sessionId
 */
router.delete('/engine/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  await engine.cleanup();
  enhancedEngines.delete(sessionId);
  res.json({ success: true, message: 'Engine deleted' });
});

// ============================================
// 错误恢复 API
// ============================================

/**
 * 尝试错误恢复
 * POST /api/multiagent/recovery
 */
router.post('/recovery', async (req, res) => {
  const { errorCode, context = {} } = req.body;

  try {
    const { AgentError } = require('../services/errorHandler');
    const error = new AgentError('Recovery request', errorCode, context);
    const result = await recoveryManager.attemptRecovery(error, context);
    res.json({ success: true, recovery: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取可用的恢复处理器
 * GET /api/multiagent/recovery/handlers
 */
router.get('/recovery/handlers', (req, res) => {
  const handlers = Array.from(recoveryManager.recoveryHandlers.keys());
  res.json({ success: true, handlers });
});

// ============================================
// 工具系统 API
// ============================================

/**
 * 获取所有可用工具
 * GET /api/multiagent/tools
 */
router.get('/tools', (req, res) => {
  const registry = createDefaultToolRegistry();
  const tools = registry.listTools();

  res.json({
    success: true,
    tools,
    count: tools.length
  });
});

/**
 * 执行工具
 * POST /api/multiagent/tools/execute
 */
router.post('/tools/execute', async (req, res) => {
  const { toolName, input, options = {} } = req.body;

  const registry = createDefaultToolRegistry();

  try {
    const result = await registry.execute(toolName, input, options);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 兼容性和测试端点
// ============================================

/**
 * 获取模板列表 (兼容格式)
 * GET /api/multiagent/templates
 */
router.get('/templates', (req, res) => {
  res.json({
    success: true,
    templates: AGENT_TEMPLATES.map(t => ({
      id: t.id,
      name: t.role,
      role: t.role,
      goal: t.goal,
      description: t.goal,
      tools: t.tools || []
    })),
    agentTemplates: AGENT_TEMPLATES,
    taskTemplates: TASK_TEMPLATES
  });
});

/**
 * 获取Agent模板
 * GET /api/multiagent/agent-templates
 */
router.get('/agent-templates', (req, res) => {
  res.json({
    success: true,
    templates: AGENT_TEMPLATES
  });
});

/**
 * 获取引擎状态 (兼容 /status 路径)
 * GET /api/multiagent/engine/:sessionId/status
 */
router.get('/engine/:sessionId/status', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  res.json({
    success: true,
    state: engine.getState(),
    status: engine.getState().status
  });
});

/**
 * 创建检查点
 * POST /api/multiagent/engine/:sessionId/checkpoint
 */
router.post('/engine/:sessionId/checkpoint', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  try {
    // 使用 checkpointManager.save 方法
    const checkpoint = engine.checkpointManager.save(sessionId, engine.getState());
    res.json({
      success: true,
      checkpointId: checkpoint.id,
      message: 'Checkpoint created successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取记忆统计 (兼容路径)
 * GET /api/multiagent/engine/:sessionId/memory/stats
 */
router.get('/engine/:sessionId/memory/stats', (req, res) => {
  const { sessionId } = req.params;
  const engine = enhancedEngines.get(sessionId);

  if (!engine) {
    return res.status(404).json({ success: false, error: 'Engine not found' });
  }

  const stats = engine.memory?.getStats?.() || { total: 0, recent: 0 };
  res.json({ success: true, memory: stats });
});

/**
 * Crew执行
 * POST /api/multiagent/crew/:crewId/execute
 */
router.post('/crew/:crewId/execute', async (req, res) => {
  const { crewId } = req.params;
  const { task } = req.body;

  const crew = crews.get(crewId);
  if (!crew) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }

  try {
    const mockLLMClient = {
      complete: async ({ prompt }) => {
        return `[Crew ${crewId}] Processed: ${prompt.substring(0, 50)}...`;
      }
    };

    const result = await crew.execute(mockLLMClient);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Crew状态
 * GET /api/multiagent/crew/:crewId/status
 */
router.get('/crew/:crewId/status', (req, res) => {
  const { crewId } = req.params;
  const crew = crews.get(crewId);

  if (!crew) {
    return res.status(404).json({ success: false, error: 'Crew not found' });
  }

  res.json({
    success: true,
    crew: crew.getStatus()
  });
});

module.exports = router;