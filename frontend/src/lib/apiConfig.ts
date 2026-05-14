// Centralized API Configuration
// All API base URLs should be imported from here

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:30000';

// Export individual endpoints for different services
export const API_ENDPOINTS = {
  // Main API
  base: API_BASE,

  // Chat
  chat: `${API_BASE}/api/chat`,

  // Config
  config: {
    channels: `${API_BASE}/config/channels`,
    keys: `${API_BASE}/config/keys`,
    defaults: `${API_BASE}/config/defaults`,
  },

  // RAG
  rag: {
    kb: `${API_BASE}/api/rag/kb`,
    stats: `${API_BASE}/api/rag/stats`,
  },

  // Browser
  browser: `${API_BASE}/api/browser`,

  // Memory
  memory: `${API_BASE}/api/memory`,

  // Enhanced Agent
  enhancedAgent: `${API_BASE}/api/enhanced-agent`,

  // HITL
  hitl: `${API_BASE}/api/hitl`,

  // MCP
  mcp: `${API_BASE}/mcp`,

  // Multi-Agent
  multiagent: `${API_BASE}/api/multiagent`,

  // n8n
  n8n: `${API_BASE}/n8n`,

  // Search
  search: `${API_BASE}/api/search`,

  // Checkpoint
  checkpoint: `${API_BASE}/checkpoint`,

  // Image Generation
  imageGeneration: `${API_BASE}/image/generation`,

  // MiniMax MCP
  minimax: `${API_BASE}/minimax`,

  // Intent Tree
  intent: {
    tree: `${API_BASE}/api/admin/intent/tree`,
    node: `${API_BASE}/api/admin/intent/node`,
    test: `${API_BASE}/api/admin/intent/test`,
  },

  // Admin
  admin: {
    models: `${API_BASE}/api/admin/models`,
    modelsStats: `${API_BASE}/api/admin/models/stats`,
    knowledge: `${API_BASE}/api/admin/knowledge`,
    knowledgeStats: `${API_BASE}/api/admin/knowledge/stats`,
    tools: `${API_BASE}/api/admin/tools`,
    stats: `${API_BASE}/api/admin/stats`,
  },

  // Metrics
  metrics: {
    realtime: `${API_BASE}/api/metrics/realtime`,
    summary: `${API_BASE}/api/metrics/summary`,
    prometheus: `${API_BASE}/api/metrics`,
  },

  // Execution History
  execution: `${API_BASE}/api/execution`,

  // Alerts
  alerts: `${API_BASE}/api/alerts`,
} as const;

export default API_ENDPOINTS;
