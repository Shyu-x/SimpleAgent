# 测试框架文档

## 测试概览

AI Chat 玩具项目采用多层次测试策略：

| 层级 | 工具 | 用途 |
|------|------|------|
| 单元测试 | Jest | 模块独立测试 |
| API测试 | Jest + Supertest | HTTP端点测试 |
| 集成测试 | Jest | 多模块协作 |
| E2E测试 | Playwright | 浏览器自动化 |

## 测试统计

| 阶段 | 测试数 | 通过率 |
|------|--------|--------|
| P0 单元测试 | 245 | 100% |
| P1 Admin API | 12 | 100% |
| P2 RAG | 17 | 81% |
| P4 E2E | 25 | 76% |
| **总计** | **303** | **~90%** |

## P0 模块覆盖率

| 模块 | 行覆盖率 | 函数覆盖率 |
|------|----------|------------|
| mcp.js | 54.86% | 65.45% |
| pluginManager.js | 89.91% | 77.41% |
| skillSystem.js | 99.35% | 96.55% |
| workflowEngine.js | 90.61% | 97.29% |

## 运行测试

### 单元测试（串行执行）
```bash
cd backend
npm test -- --runInBand --testPathPatterns="unit/(mcp|pluginManager|workflowEngine|skillSystem)"
```

### API测试
```bash
npm test -- --runInBand --testPathPatterns="api_admin"
npm test -- --runInBand --testPathPatterns="api_rag"
```

### 集成测试
```bash
npm test -- --runInBand --testPathPatterns="integration"
```

### E2E测试
```bash
cd frontend
node tests/E2E聊天功能测试.js
```

## P0 关键模块测试

### MCP协议测试 (56 tests)
```javascript
// backend/tests/unit/mcp.test.js
describe('MCP Protocol', () => {
  test('工具注册和调用');
  test('资源订阅管理');
  test('执行统计追踪');
});
```

### PluginManager测试 (58 tests)
```javascript
// backend/tests/unit/pluginManager.test.js
describe('PluginManager', () => {
  test('插件注册和加载');
  test('Hook执行机制');
  test('状态转换');
});
```

### SkillSystem测试 (72 tests)
```javascript
// backend/tests/unit/skillSystem.test.js
describe('SkillSystem', () => {
  test('技能注册和执行');
  test('Token成本计算');
  test('缓存机制');
});
```

### WorkflowEngine测试 (59 tests)
```javascript
// backend/tests/unit/workflowEngine.test.js
describe('WorkflowEngine', () => {
  test('节点类型执行');
  test('变量替换');
  test('暂停/恢复');
});
```

## 覆盖率配置

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 60,
    functions: 60,
    lines: 60,
    statements: 60,
  }
}
```

## Mock策略

### API测试Mock示例
```javascript
const mockToolRegistry = {
  listTools: jest.fn().mockReturnValue([]),
  getToolStats: jest.fn().mockReturnValue({ totalCalls: 0 }),
  has: jest.fn().mockReturnValue(false),
  register: jest.fn(),
  unregister: jest.fn(),
};
```

## 已知问题

1. **api_rag.test.js**: 4个测试失败（需要Qdrant服务）
2. **集成测试**: process.exit()冲突（Jest适配问题）
3. **E2E测试**: 6个测试失败（端口配置3001→8080）

## 测试报告

生成HTML覆盖率报告：
```bash
npm test -- --coverage --coverageReporters=text,lcov,html
```

报告位置: `backend/coverage/index.html`