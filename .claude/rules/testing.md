# Testing Rules

## Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

## Edge Cases to Test

Every function must be tested with:
- [ ] Null/undefined inputs
- [ ] Empty arrays/strings
- [ ] Invalid types
- [ ] Boundary values (min/max)
- [ ] Error conditions

## Test Quality Checklist

- [ ] Tests are independent (no shared state)
- [ ] Test names describe behavior
- [ ] Mocks used for external dependencies
- [ ] Both happy path and error paths tested
- [ ] No flaky tests

## A11y 验收 (Wave #8 起强制)

每个新页面 / 组件必须满足:
- [ ] `node scripts/a11y-audit.mjs <url>` → critical=0, serious=0
- [ ] 每个交互元素有可访问名称 (`aria-label` 或 text content)
- [ ] landmark 结构: `<main>` / `<nav>` / `<aside>` 不嵌套冲突
- [ ] 颜色对比度 ≥ 4.5:1 (文字) / 3:1 (大文字)
- [ ] 键盘可访问: Tab / Shift+Tab 焦点循环
- [ ] 焦点可见 (`:focus-visible` outline 不能被覆盖)

## Journey 脚本验收 (Wave #8 起强制)

每个新用户旅程必须有:
- [ ] `scripts/journey-<name>.mjs` 支持 `--live` / `--dry-run` 双模式
- [ ] `--dry-run` 退出码 0 (脚本骨架就绪)
- [ ] `--live` 跑出真实验证 (截图 / API 调用)
- [ ] `docs/online/journeys/<name>/README.md` 描述旅程步骤
- [ ] 至少 1 张截图证据 (PNG 在同目录)

## Docker 验收 (Wave #8 起强制)

每次改 Dockerfile 或依赖:
- [ ] `docker images | grep simpleagent` 总和 < 800MB
- [ ] `docker compose up` 启动后 `curl /api/health` 200
- [ ] `.dockerignore` 存在, 排除 node_modules / .next / .git
- [ ] 多阶段构建, 运行时无 dev 依赖

## [CUSTOMIZE] Project-Specific Testing

Add your project-specific testing requirements here:
- Test framework configuration
- Mock setup patterns
- E2E test scenarios
