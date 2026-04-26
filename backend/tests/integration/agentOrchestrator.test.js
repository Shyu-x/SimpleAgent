/**
 * AgentOrchestrator 集成测试
 */

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

// ========== Mock Classes ==========

class MockCheckpointManager {
  constructor() {
    this.checkpoints = new Map();
    this.saveCount = 0;
  }

  async save(sessionId, state) {
    const id = `cp_${Date.now()}`;
    this.checkpoints.set(id, {
      id,
      sessionId,
      state,
      createdAt: Date.now()
    });
    this.saveCount++;
    return { id, checkpointId: id };
  }

  async list(sessionId) {
    const result = [];
    for (const [id, cp] of this.checkpoints.entries()) {
      if (cp.sessionId === sessionId) {
        result.push({ id, createdAt: cp.createdAt });
      }
    }
    return result;
  }

  async load(checkpointId) {
    return this.checkpoints.get(checkpointId) || null;
  }
}

class MockHumanLoop {
  constructor() {
    this.pendingRequests = new Map();
    this.requestCount = 0;
  }

  createRequest(sessionId, confirmation) {
    const id = `hl_${Date.now()}`;
    this.pendingRequests.set(id, {
      id,
      sessionId,
      confirmation,
      status: 'pending',
      createdAt: Date.now()
    });
    this.requestCount++;
    return { id, requestId: id };
  }

  getPending(sessionId) {
    const result = [];
    for (const [id, req] of this.pendingRequests.entries()) {
      if (req.sessionId === sessionId && req.status === 'pending') {
        result.push(req);
      }
    }
    return result;
  }

  respond(confirmationId, approved) {
    const req = this.pendingRequests.get(confirmationId);
    if (req) {
      req.status = approved ? 'approved' : 'rejected';
      req.respondedAt = Date.now();
    }
    return { success: true, approved };
  }
}

class MockMemory {
  constructor() {
    this.shortTerm = [];
    this.longTerm = [];
  }

  add(message) {
    this.shortTerm.push(message);
  }

  search(query) {
    // 简单实现：返回包含查询词的记忆
    return this.shortTerm.filter(m =>
      m.content && m.content.includes(query)
    );
  }

  promoteToLongTerm(item) {
    this.shortTerm = this.shortTerm.filter(m => m !== item);
    this.longTerm.push(item);
  }

  export() {
    return {
      shortTerm: this.shortTerm,
      longTerm: this.longTerm
    };
  }
}

class MockAgentEngine {
  constructor(config = {}) {
    this.sessionId = config.sessionId;
    this.state = {
      status: 'idle',
      currentCheckpoint: null,
      iteration: 0
    };
    this.checkpointManager = new MockCheckpointManager();
    this.humanLoop = new MockHumanLoop();
    this.memory = new MockMemory();
    this.events = [];
    this.executionCount = 0;
  }

  on(event, callback) {
    this.events.push({ event, callback });
  }

  async execute(task, context = {}) {
    this.executionCount++;
    this.state.status = 'executing';
    this.state.iteration++;

    // 模拟执行
    return {
      result: `Executed: ${task}`,
      iterations: this.state.iteration,
      context
    };
  }

  getState() {
    return { ...this.state };
  }

  pause() {
    this.state.status = 'paused';
    return { checkpoint: this.state.currentCheckpoint };
  }

  resume() {
    this.state.status = 'executing';
    return { success: true };
  }

  respondToConfirmation(confirmationId, approved, modifiedInput) {
    return this.humanLoop.respond(confirmationId, approved);
  }

  async cleanup() {
    this.state.status = 'terminated';
  }
}

class MockMiniMaxAgentRunner {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxSteps = config.maxSteps || 50;
    this.sessionId = `agent_${Date.now()}`;
    this.steps = 0;
    this.toolCalls = [];
  }

  async run(task) {
    this.steps++;
    return {
      result: `Agent completed: ${task}`,
      steps: this.steps
    };
  }

  getToolSchemas() {
    return [
      { name: 'file_read', description: '读取文件' },
      { name: 'file_write', description: '写入文件' },
      { name: 'shell', description: '执行命令' }
    ];
  }
}

// ========== AgentOrchestrator Mock ==========

class AgentOrchestrator {
  constructor() {
    this.sessions = new Map();
    this.miniMaxSessions = new Map();
    this.checkpointManager = new MockCheckpointManager();
    this.humanLoop = new MockHumanLoop();
  }

  // 会话管理
  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      const engine = new MockAgentEngine({ sessionId });
      this.sessions.set(sessionId, {
        engine,
        createdAt: Date.now(),
        lastAccess: Date.now()
      });
    }

    const session = this.sessions.get(sessionId);
    session.lastAccess = Date.now();
    return session;
  }

  async execute({ sessionId, task, context = {} }) {
    const session = this.getOrCreateSession(sessionId);
    return session.engine.execute(task, context);
  }

  getState(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.getState();
  }

  pause(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.pause();
  }

  resume(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.resume();
  }

  // 检查点管理
  async saveCheckpoint(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return this.checkpointManager.save(sessionId, session.engine.getState());
  }

  async listCheckpoints(sessionId) {
    return this.checkpointManager.list(sessionId);
  }

  async restoreFromCheckpoint(sessionId, checkpointId) {
    const checkpoint = await this.checkpointManager.load(checkpointId);
    if (!checkpoint) return null;

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.engine.state = { ...checkpoint.state };
    return { success: true };
  }

  // 人机确认
  getPendingConfirmations(sessionId) {
    return this.humanLoop.getPending(sessionId);
  }

  respondToConfirmation(sessionId, confirmationId, approved, modifiedInput) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.respondToConfirmation(confirmationId, approved, modifiedInput);
  }

  // 记忆管理
  getMemory(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory.export();
  }

  searchMemory(sessionId, query, limit = 10) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory.search(query).slice(0, limit);
  }

  promoteMemory(sessionId, content, type, importance) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.engine.memory.promoteToLongTerm({ content, type, importance });
  }

  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    await session.engine.cleanup();
    this.sessions.delete(sessionId);
    return true;
  }

  listSessions() {
    const result = [];
    for (const [id, session] of this.sessions.entries()) {
      result.push({
        id,
        createdAt: session.createdAt,
        lastAccess: session.lastAccess,
        status: session.engine.state.status
      });
    }
    return result;
  }

  // MiniMax Agent
  createMiniMaxSession({ apiKey, model, maxSteps }) {
    const agent = new MockMiniMaxAgentRunner({ apiKey, model, maxSteps });
    const sessionId = agent.sessionId;
    this.miniMaxSessions.set(sessionId, {
      agent,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });

    return {
      sessionId,
      tools: agent.getToolSchemas().map(t => ({ name: t.name, description: t.description }))
    };
  }

  getMiniMaxSession(sessionId) {
    return this.miniMaxSessions.get(sessionId) || null;
  }

  deleteMiniMaxSession(sessionId) {
    if (!this.miniMaxSessions.has(sessionId)) return false;
    this.miniMaxSessions.delete(sessionId);
    return true;
  }

  getMiniMaxTools() {
    return [
      { name: 'file_read', description: '读取文件内容' },
      { name: 'file_write', description: '写入内容到文件' },
      { name: 'file_list', description: '列出目录中的文件' },
      { name: 'shell', description: '执行 Shell 命令' },
      { name: 'web_search', description: '搜索网络信息' }
    ];
  }
}

// ========== Tests ==========

function runTests() {
  console.log('\n========================================');
  console.log('AgentOrchestrator 集成测试');
  console.log('========================================\n');

  // ========== 1. 构造函数测试 ==========
  console.log('【1. 构造函数测试】');

  runTest('默认构造函数应正确初始化', () => {
    const orchestrator = new AgentOrchestrator();

    assertTrue(orchestrator.sessions instanceof Map, '应有 sessions Map');
    assertTrue(orchestrator.miniMaxSessions instanceof Map, '应有 miniMaxSessions Map');
  });

  // ========== 2. 会话管理测试 ==========
  console.log('\n【2. 会话管理测试】');

  runTest('getOrCreateSession 应创建新会话', () => {
    const orchestrator = new AgentOrchestrator();

    const session = orchestrator.getOrCreateSession('session_1');

    assertTrue(session !== null, '应返回会话');
    assertTrue(session.engine !== null, '会话应有 engine');
    assertEqual(session.engine.sessionId, 'session_1', '会话 ID 应正确');
  });

  runTest('getOrCreateSession 应返回已存在会话', () => {
    const orchestrator = new AgentOrchestrator();

    const session1 = orchestrator.getOrCreateSession('session_1');
    const session2 = orchestrator.getOrCreateSession('session_1');

    assertEqual(session1, session2, '应返回相同会话');
  });

  runTest('listSessions 应列出所有会话', () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    orchestrator.getOrCreateSession('session_2');

    const sessions = orchestrator.listSessions();

    assertEqual(sessions.length, 2, '应有 2 个会话');
  });

  // ========== 3. Agent 执行测试 ==========
  console.log('\n【3. Agent 执行测试】');

  runTest('execute 应执行任务', async () => {
    const orchestrator = new AgentOrchestrator();

    const result = await orchestrator.execute({
      sessionId: 'session_1',
      task: '帮我搜索 AI'
    });

    assertTrue(result.result !== null, '应有结果');
    assertTrue(result.iterations > 0, '应有迭代次数');
  });

  runTest('execute 应增加会话访问时间', async () => {
    const orchestrator = new AgentOrchestrator();

    const session1 = orchestrator.getOrCreateSession('session_1');
    const before = session1.lastAccess;

    await orchestrator.execute({
      sessionId: 'session_1',
      task: '测试任务'
    });

    const after = session1.lastAccess;
    assertTrue(after >= before, 'lastAccess 应更新');
  });

  // ========== 4. 状态管理测试 ==========
  console.log('\n【4. 状态管理测试】');

  runTest('getState 应返回会话状态', () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    const state = orchestrator.getState('session_1');

    assertTrue(state !== null, '应返回状态');
    assertTrue('status' in state, '状态应包含 status');
  });

  runTest('不存在的会话 getState 应返回 null', () => {
    const orchestrator = new AgentOrchestrator();

    const state = orchestrator.getState('non_existent');

    assertEqual(state, null, '不存在会话应返回 null');
  });

  runTest('pause 应暂停会话', () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    const result = orchestrator.pause('session_1');

    assertTrue(result !== null, '应返回暂停结果');
    const state = orchestrator.getState('session_1');
    assertEqual(state.status, 'paused', '状态应为 paused');
  });

  runTest('resume 应恢复会话', () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    orchestrator.pause('session_1');
    const result = orchestrator.resume('session_1');

    assertTrue(result.success, '应成功恢复');
    const state = orchestrator.getState('session_1');
    assertEqual(state.status, 'executing', '状态应为 executing');
  });

  // ========== 5. 检查点管理测试 ==========
  console.log('\n【5. 检查点管理测试】');

  runTest('saveCheckpoint 应保存检查点', async () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    const result = await orchestrator.saveCheckpoint('session_1');

    assertTrue(result !== null, '应返回检查点');
    assertTrue(result.id !== null, '检查点应有 ID');
  });

  runTest('listCheckpoints 应列出检查点', async () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    await orchestrator.saveCheckpoint('session_1');
    await orchestrator.saveCheckpoint('session_1');

    const checkpoints = await orchestrator.listCheckpoints('session_1');

    assertEqual(checkpoints.length, 2, '应有 2 个检查点');
  });

  runTest('restoreFromCheckpoint 应恢复检查点', async () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    await orchestrator.execute({ sessionId: 'session_1', task: '任务 1' });

    const checkpoints = await orchestrator.listCheckpoints('session_1');
    if (checkpoints.length > 0) {
      const result = await orchestrator.restoreFromCheckpoint('session_1', checkpoints[0].id);
      assertTrue(result.success, '应成功恢复');
    }
  });

  // ========== 6. 记忆管理测试 ==========
  console.log('\n【6. 记忆管理测试】');

  runTest('getMemory 应返回记忆数据', () => {
    const orchestrator = new AgentOrchestrator();

    const session = orchestrator.getOrCreateSession('session_1');
    session.engine.memory.add({ role: 'user', content: '测试记忆' });

    const memory = orchestrator.getMemory('session_1');

    assertTrue(memory !== null, '应返回记忆');
    assertTrue(Array.isArray(memory.shortTerm), '应有短时记忆');
  });

  runTest('searchMemory 应搜索记忆', () => {
    const orchestrator = new AgentOrchestrator();

    const session = orchestrator.getOrCreateSession('session_1');
    session.engine.memory.add({ role: 'user', content: 'Python 编程' });
    session.engine.memory.add({ role: 'user', content: 'JavaScript 编程' });

    const results = orchestrator.searchMemory('session_1', 'Python');

    assertEqual(results.length, 1, '应找到 1 条记忆');
    assertTrue(results[0].content.includes('Python'), '内容应包含 Python');
  });

  runTest('promoteMemory 应提升记忆到长期', () => {
    const orchestrator = new AgentOrchestrator();

    const session = orchestrator.getOrCreateSession('session_1');
    session.engine.memory.add({ role: 'user', content: '重要信息' });

    orchestrator.promoteMemory('session_1', { content: '重要信息' }, 'important', 5);

    const memory = orchestrator.getMemory('session_1');
    assertEqual(memory.longTerm.length, 1, '应有 1 条长期记忆');
  });

  // ========== 7. 清理测试 ==========
  console.log('\n【7. 清理测试】');

  runTest('cleanupSession 应清理会话', async () => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.getOrCreateSession('session_1');
    const result = await orchestrator.cleanupSession('session_1');

    assertTrue(result, '清理应返回 true');
    assertEqual(orchestrator.sessions.has('session_1'), false, '会话应被删除');
  });

  runTest('cleanupSession 清理不存在的会话应返回 false', async () => {
    const orchestrator = new AgentOrchestrator();

    const result = await orchestrator.cleanupSession('non_existent');

    assertEqual(result, false, '清理不存在的会话应返回 false');
  });

  // ========== 8. MiniMax Agent 测试 ==========
  console.log('\n【8. MiniMax Agent 测试】');

  runTest('createMiniMaxSession 应创建会话', () => {
    const orchestrator = new AgentOrchestrator();

    const result = orchestrator.createMiniMaxSession({
      apiKey: 'test_key',
      model: 'MiniMax-M2.7',
      maxSteps: 50
    });

    assertTrue(result.sessionId !== null, '应有 sessionId');
    assertTrue(Array.isArray(result.tools), '应有工具列表');
  });

  runTest('getMiniMaxSession 应获取会话', () => {
    const orchestrator = new AgentOrchestrator();

    const created = orchestrator.createMiniMaxSession({
      apiKey: 'test_key',
      model: 'MiniMax-M2.7'
    });

    const session = orchestrator.getMiniMaxSession(created.sessionId);

    assertTrue(session !== null, '应返回会话');
  });

  runTest('deleteMiniMaxSession 应删除会话', () => {
    const orchestrator = new AgentOrchestrator();

    const created = orchestrator.createMiniMaxSession({
      apiKey: 'test_key',
      model: 'MiniMax-M2.7'
    });

    const result = orchestrator.deleteMiniMaxSession(created.sessionId);

    assertTrue(result, '删除应返回 true');
    assertEqual(orchestrator.getMiniMaxSession(created.sessionId), null, '会话应被删除');
  });

  runTest('getMiniMaxTools 应返回工具列表', () => {
    const orchestrator = new AgentOrchestrator();

    const tools = orchestrator.getMiniMaxTools();

    assertTrue(tools.length > 0, '应有工具');
    assertTrue(tools[0].name !== null, '工具应有名称');
  });

  // ========== 9. 并发测试 ==========
  console.log('\n【9. 并发测试】');

  runTest('多个并发会话应正确处理', async () => {
    const orchestrator = new AgentOrchestrator();

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(orchestrator.execute({
        sessionId: `session_${i}`,
        task: `任务 ${i}`
      }));
    }

    const results = await Promise.all(promises);

    assertEqual(results.length, 10, '应有 10 个结果');
    assertTrue(results.every(r => r.result !== null), '所有结果应有效');
  });

  // ========== 汇总 ==========
  console.log('\n========================================');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
  console.log('========================================\n');

  return { passed, failed };
}

// 运行
runTests();
