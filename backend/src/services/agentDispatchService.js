/**
 * Agent 任务分发服务
 * 支持多种分发策略：负载均衡、技能匹配、优先级、混合
 */

const {
  getAllPresetAgents,
  getAgentById,
  findAgentsByCapability,
  getAllCapabilities
} = require('../common/agent-roles');

/**
 * 分发策略类型
 */
const DISPATCH_STRATEGIES = {
  LOAD_BALANCE: 'load_balance',      // 负载均衡
  SKILL_MATCH: 'skill_match',        // 技能匹配
  PRIORITY: 'priority',              // 优先级
  HYBRID: 'hybrid'                   // 混合策略（默认）
};

/**
 * Agent 池（运行时状态）
 */
const agentPool = new Map();

/**
 * 注册 Agent 到池中
 */
function registerAgent(agentId, capabilities = [], metadata = {}) {
  agentPool.set(agentId, {
    id: agentId,
    capabilities,
    metadata,
    load: 0,                    // 当前负载
    maxLoad: metadata.maxLoad || 10,
    status: 'online',          // online, busy, offline
    registeredAt: Date.now()
  });
}

/**
 * 注销 Agent
 */
function unregisterAgent(agentId) {
  agentPool.delete(agentId);
}

/**
 * 更新 Agent 负载
 */
function updateAgentLoad(agentId, delta) {
  const agent = agentPool.get(agentId);
  if (agent) {
    agent.load = Math.max(0, agent.load + delta);
  }
}

/**
 * 计算 Agent 评分（混合策略）
 */
function calculateScore(agent, requiredCapabilities, preferences = {}) {
  const { strategy = 'hybrid', weights = { skill: 0.4, load: 0.3, priority: 0.3 } } = preferences;

  let skillScore = 0;
  let loadScore = 0;

  switch (strategy) {
    case DISPATCH_STRATEGIES.SKILL_MATCH:
      // 只考虑技能匹配
      skillScore = requiredCapabilities.every(cap => agent.capabilities.includes(cap)) ? 1 : 0;
      return skillScore;

    case DISPATCH_STRATEGIES.LOAD_BALANCE:
      // 只考虑负载（负载越低越好）
      loadScore = 1 - (agent.load / agent.maxLoad);
      return loadScore;

    case DISPATCH_STRATEGIES.PRIORITY:
      // 使用 metadata 中的优先级
      return agent.metadata.priority || 0;

    case DISPATCH_STRATEGIES.HYBRID:
    default:
      // 技能匹配度
      const matchCount = requiredCapabilities.filter(cap =>
        agent.capabilities.includes(cap)
      ).length;
      skillScore = requiredCapabilities.length > 0
        ? matchCount / requiredCapabilities.length
        : 0.5;

      // 负载评分（负载越低越好）
      loadScore = 1 - (agent.load / agent.maxLoad);

      // 加权总分
      return (skillScore * weights.skill) +
             (loadScore * weights.load) +
             ((agent.metadata.priority || 0) * weights.priority);
  }
}

/**
 * 选择最佳 Agent
 */
function selectBestAgent(requiredCapabilities = [], preferences = {}) {
  const { strategy = 'hybrid' } = preferences;

  // 获取在线 Agent
  const onlineAgents = Array.from(agentPool.values()).filter(
    agent => agent.status === 'online'
  );

  if (onlineAgents.length === 0) {
    return null;
  }

  // 根据策略筛选
  let candidates = onlineAgents;

  if (strategy === DISPATCH_STRATEGIES.SKILL_MATCH) {
    candidates = onlineAgents.filter(agent =>
      requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    );
  }

  if (candidates.length === 0) {
    // 如果没有完全匹配的，返回负载最低的
    candidates = onlineAgents;
  }

  // 评分排序
  const scored = candidates.map(agent => ({
    agent,
    score: calculateScore(agent, requiredCapabilities, preferences)
  })).sort((a, b) => b.score - a.score);

  return scored[0]?.agent || null;
}

/**
 * 智能分发任务
 */
async function dispatchTask(task, preferences = {}) {
  const { requiredCapabilities = [], strategy = 'hybrid', fallbackEnabled = true } = preferences;

  // 1. 尝试主要策略选择
  let selectedAgent = selectBestAgent(requiredCapabilities, preferences);

  // 2. 如果没有匹配且启用 fallback，选择预设角色
  if (!selectedAgent && fallbackEnabled) {
    const presetAgents = getAllPresetAgents();
    // 优先选择具有相关能力的预设 Agent
    for (const cap of requiredCapabilities) {
      const matching = findAgentsByCapability(cap);
      if (matching.length > 0) {
        selectedAgent = {
          id: matching[0].id,
          isPreset: true,
          ...matching[0]
        };
        break;
      }
    }
  }

  // 3. 更新负载
  if (selectedAgent) {
    updateAgentLoad(selectedAgent.id, 1);
  }

  return {
    success: !!selectedAgent,
    agent: selectedAgent,
    strategy,
    timestamp: Date.now()
  };
}

/**
 * 任务完成回调
 */
function onTaskComplete(agentId) {
  updateAgentLoad(agentId, -1);
}

/**
 * 获取 Agent 池状态
 */
function getPoolStatus() {
  return {
    total: agentPool.size,
    online: Array.from(agentPool.values()).filter(a => a.status === 'online').length,
    busy: Array.from(agentPool.values()).filter(a => a.status === 'busy').length,
    agents: Array.from(agentPool.values())
  };
}

module.exports = {
  DISPATCH_STRATEGIES,
  registerAgent,
  unregisterAgent,
  updateAgentLoad,
  selectBestAgent,
  dispatchTask,
  onTaskComplete,
  getPoolStatus
};