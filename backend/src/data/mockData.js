// 模拟AI回复数据 - 用于测试打字机效果
const mockResponses = {
  greeting: [
    "你好！我是AI助手，很高兴为你服务。",
    "有什么我可以帮助你的吗？",
    "我可以回答问题、编写代码、翻译文本等。",
    "请告诉我你需要什么帮助！"
  ],

  code: `这是一个简单的JavaScript函数示例：

\`\`\`javascript
function greet(name) {
  return \`你好, \${name}!\`;
}

console.log(greet('世界'));
\`\`\`

这段代码会输出: 你好, 世界!`,

  explanation: `AI对话平台的后端服务具有以下特点：

1. **SSE流式响应**
   - 支持实时流式输出
   - 实现打字机效果
   - 提升用户体验

2. **多平台支持**
   - OpenAI
   - Claude
   - 智谱AI
   - Minimax

3. **统一API格式**
   - 参考One API设计
   - OpenAI兼容接口
   - 便于扩展和集成`,

  long: `这是一段较长的模拟回复，用于测试流式输出的效果。

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`
};

// 模拟API渠道配置
const channels = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.5-turbo', 'gpt-5', 'o1', 'o1-mini', 'o3', 'o3-mini'],
    defaultModel: 'gpt-4o',
    enabled: true
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true
  },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    defaultModel: 'gemini-2.5-pro',
    enabled: true
  },
  {
    id: 'zhipu',
    name: '智谱AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4', 'glm-4-flash', 'glm-3-turbo'],
    defaultModel: 'glm-4-plus',
    enabled: true
  },
  {
    id: 'minimax',
    name: 'Minimax',
    baseUrl: 'https://api.minimax.chat/v1',
    models: ['abab7-chat', 'abab6.5s-chat', 'abab6-chat'],
    defaultModel: 'abab7-chat',
    enabled: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    enabled: true
  }
];

// 模拟会话数据
let sessions = [
  {
    id: 'session-1',
    title: '第一次对话',
    createdAt: '2026-03-13T08:00:00Z',
    updatedAt: '2026-03-13T08:30:00Z',
    messages: [
      { role: 'user', content: '你好，请介绍一下自己', timestamp: '2026-03-13T08:00:00Z' },
      { role: 'assistant', content: '你好！我是AI助手，很高兴为你服务。', timestamp: '2026-03-13T08:00:05Z' }
    ]
  },
  {
    id: 'session-2',
    title: '关于编程的问题',
    createdAt: '2026-03-13T09:00:00Z',
    updatedAt: '2026-03-13T09:15:00Z',
    messages: [
      { role: 'user', content: '如何用JavaScript写一个hello world？', timestamp: '2026-03-13T09:00:00Z' },
      { role: 'assistant', content: 'console.log("Hello, World!");', timestamp: '2026-03-13T09:00:03Z' }
    ]
  }
];

module.exports = {
  mockResponses,
  channels,
  sessions
};
