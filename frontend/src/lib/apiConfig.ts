// Centralized API Configuration
// All API base URLs should be imported from here

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

// Export individual endpoints for different services
export const API_ENDPOINTS = {
  // Main API
  base: API_BASE,

  // Chat
  chat: `${API_BASE}/chat`,

  // Config
  config: {
    channels: `${API_BASE}/config/channels`,
    keys: `${API_BASE}/config/keys`,
    defaults: `${API_BASE}/config/defaults`,
  },

  // RAG
  rag: {
    kb: `${API_BASE}/rag/kb`,
    stats: `${API_BASE}/rag/stats`,
  },

  // Browser
  browser: `${API_BASE}/browser`,

  // Memory
  memory: `${API_BASE}/memory`,

  // Enhanced Agent
  enhancedAgent: `${API_BASE}/enhanced-agent`,

  // HITL
  hitl: `${API_BASE}/hitl`,

  // MCP
  mcp: `${API_BASE}/mcp`,

  // Multi-Agent
  multiagent: `${API_BASE}/multiagent`,

  // n8n
  n8n: `${API_BASE}/n8n`,

  // Search
  search: `${API_BASE}/search`,

  // Checkpoint
  checkpoint: `${API_BASE}/checkpoint`,

  // Image Generation
  imageGeneration: `${API_BASE}/image/generation`,

  // MiniMax MCP
  minimax: `${API_BASE}/minimax`,
} as const;

export default API_ENDPOINTS;
