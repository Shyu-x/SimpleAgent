/**
 * CommitLint 配置 - 基于 Conventional Commits + 模块标识
 *
 * 验证规则：
 * - type 必须在允许列表中
 * - 模块标识必须匹配预定义模块
 * - description 不能为空且不超过 72 字符
 * - body 和 footer 格式验证
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // ========== Type 规则 ==========
    // 必须符合以下类型之一
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 错误修复
        'docs',     // 文档变更
        'style',    // 代码格式（不影响运行）
        'refactor', // 重构（不是功能也不是修复）
        'perf',     // 性能优化
        'test',     // 测试相关
        'build',    // 构建或依赖变更
        'ci',       // CI 配置变更
        'chore',    // 其他变更（不涉及 src）
        'revert',   // 回滚提交
        'wip'       // 工作进行中
      ]
    ],

    // ========== 模块标识规则 ==========
    // 必须匹配预定义模块，且小写
    'type-empty': [2, 'never'], // 不允许空 type

    // ========== Scope 规则（模块标识） ==========
    // 必须使用预定义的模块标识之一
    'scope-empty': [2, 'never'], // 不允许空 scope
    'scope-enum': [
      2,
      'always',
      [
        // 核心业务模块
        'auth',         // 认证模块
        'user',         // 用户模块
        'order',        // 订单模块
        'payment',      // 支付模块
        'product',      // 产品模块
        'inventory',    // 库存模块
        'notification', // 通知模块

        // 前端模块
        'frontend',     // 前端通用
        'ui',           // UI 组件
        'layout',       // 布局相关
        'styles',       // 样式变更

        // 后端模块
        'backend',      // 后端通用
        'api',          // API 路由
        'service',      // 业务逻辑
        'middleware',    // 中间件
        'database',     // 数据库相关
        'cache',        // 缓存相关

        // 管理模块
        'admin',        // 管理后台
        'dashboard',    // 仪表盘
        'analytics',    // 数据分析

        // 基础设施
        'infra',        // 基础设施
        'config',       // 配置变更
        'deployment',   // 部署相关
        'security',     // 安全相关

        // 其他
        'docs',         // 文档更新
        'test',         // 测试相关
        'ci',           // CI/CD
        'deps',         // 依赖更新
        'core',         // 核心模块
        'shared',       // 共享模块
        'migration',    // 数据迁移
        'logging',      // 日志相关
        'monitoring',   // 监控相关
        'mcp',          // MCP 集成
        'rag',          // RAG 系统
        'agent',        // Agent 系统
        'a2a',          // A2A 协议
        'hitl',         // HITL 系统
        'memory',       // 记忆系统
        'search',       // 搜索功能
        'tool',         // 工具系统

        // 通配符（特殊情况使用）
        '*'             // 通配符，用于跨多个模块
      ]
    ],

    // ========== Subject 规则（描述） ==========
    // 描述不能为空
    'subject-empty': [2, 'never'],
    // 描述以小写开头
    'subject-case': [2, 'always', 'lower-case'],
    // 描述最大长度
    'subject-max-length': [2, 'always', 72],

    // ========== Header 格式 ==========
    // 完整格式：type(module): description
    'header-max-length': [2, 'always', 100],
    'header-min-length': [2, 'always', 10],

    // ========== Body 规则 ==========
    // Body 换行符处理
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [2, 'always', 100],

    // ========== Footer 规则 ==========
    // Footer 前必须有空行
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],

    // ========== 破坏性变更 ==========
    // BREAKING CHANGE 必须在 footer 或 type 后加 !
    'body-empty': [0, 'never'],
    'footer-empty': [0, 'never'],
    'footer-max-line-length': [2, 'always', 100],

    // ========== 特殊规则 ==========
    // references 空格验证（关联 issue）
    'references-empty': [0, 'never'],

    // 不允许重复的 type
    'type-duplicate': [2, 'never']
  },

  // ========== 提示信息 ==========
  prompt: {
    messages: {
      type: '选择提交类型：',
      customScope: '输入模块标识：',
      subject: '简短描述（不超过 72 字符）：',
      body: '详细描述（可选）：',
      breaking: '列出任何破坏性变更（可选）：',
      footerPrefixes: '选择关联的类型（如 "Refs", "Closes"）：',
      customFooterPrefix: '输入自定义的前缀：',
      footer: '列出关联的 Issue（可选）：',
      generatingByAI: '正在生成 AI 描述...',
      generatedByAI: 'AI 生成的描述：',
      confirmCommit: '确认提交？'
    },
    types: [
      { value: 'feat', name: 'feat', description: '新功能' },
      { value: 'fix', name: 'fix', description: '错误修复' },
      { value: 'docs', name: 'docs', description: '文档变更' },
      { value: 'style', name: 'style', description: '代码格式（不影响运行）' },
      { value: 'refactor', name: 'refactor', description: '重构（不是功能也不是修复）' },
      { value: 'perf', name: 'perf', description: '性能优化' },
      { value: 'test', name: 'test', description: '测试相关' },
      { value: 'build', name: 'build', description: '构建或依赖变更' },
      { value: 'ci', name: 'ci', description: 'CI 配置变更' },
      { value: 'chore', name: 'chore', description: '其他变更' },
      { value: 'revert', name: 'revert', description: '回滚提交' },
      { value: 'wip', name: 'wip', description: '工作进行中' }
    ],
    useEmoji: false,
    scopes: [
      'auth', 'user', 'order', 'payment', 'product', 'inventory', 'notification',
      'frontend', 'ui', 'layout', 'styles',
      'backend', 'api', 'service', 'middleware', 'database', 'cache',
      'admin', 'dashboard', 'analytics',
      'infra', 'config', 'deployment', 'security',
      'docs', 'test', 'ci', 'deps',
      'core', 'shared', 'migration',
      'logging', 'monitoring',
      'mcp', 'rag', 'agent', 'a2a', 'hitl', 'memory', 'search', 'tool',
      '*'
    ]
  }
};