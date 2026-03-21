// API Client for backend communication

import { API_ENDPOINTS } from './apiConfig';

const API_BASE_URL = API_ENDPOINTS.base;

// Generic fetch wrapper with error handling
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: data.error?.message || data.error || '请求失败',
      };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : '网络错误',
    };
  }
}

// ============ Model/Channel Configuration API ============

export interface Channel {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  enabled: boolean;
}

export interface ApiKeyStatus {
  [provider: string]: 'configured' | 'not_set';
}

export const configApi = {
  // Get all channels
  getChannels: () =>
    fetchApi<Channel[]>('/config/channels'),

  // Get channel by ID
  getChannel: (id: string) =>
    fetchApi<Channel>(`/config/channels/${id}`),

  // Update channel
  updateChannel: (id: string, data: Partial<Channel>) =>
    fetchApi<Channel>(`/config/channels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Toggle channel enabled status
  toggleChannel: (id: string) =>
    fetchApi<Channel>(`/config/channels/${id}/toggle`, {
      method: 'POST',
    }),

  // Get API key status
  getApiKeyStatus: () =>
    fetchApi<ApiKeyStatus>('/config/keys'),

  // Set API key
  setApiKey: (provider: string, apiKey: string) =>
    fetchApi<{ success: boolean; provider: string; status: string }>('/config/keys', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    }),

  // Get default config
  getDefaults: () =>
    fetchApi<{ defaultChannel: string; defaultModel: string }>('/config/defaults'),

  // Set default config
  setDefaults: (defaultChannel?: string, defaultModel?: string) =>
    fetchApi<{ defaultChannel: string; defaultModel: string }>('/config/defaults', {
      method: 'PUT',
      body: JSON.stringify({ defaultChannel, defaultModel }),
    }),
};

// ============ RAG/Knowledge Base API ============

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  totalChunks: number;
  createdAt: number;
  updatedAt: number;
  documents?: {
    id: string;
    title: string;
    type: string;
    chunks: number;
    createdAt: number;
  }[];
}

export interface Document {
  id: string;
  title: string;
  type: string;
  chunks: number;
  createdAt: number;
}

export interface RetrieveResult {
  text: string;
  score: number;
  source: string;
}

export const ragApi = {
  // Create knowledge base
  createKnowledgeBase: (name: string, description?: string) =>
    fetchApi<{ success: boolean; knowledgeBase: KnowledgeBase }>('/rag/kb', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),

  // List all knowledge bases
  listKnowledgeBases: () =>
    fetchApi<{ success: boolean; knowledgeBases: KnowledgeBase[] }>('/rag/kb'),

  // Get knowledge base by ID
  getKnowledgeBase: (kbId: string) =>
    fetchApi<{ success: boolean; knowledgeBase: KnowledgeBase }>(`/rag/kb/${kbId}`),

  // Delete knowledge base
  deleteKnowledgeBase: (kbId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/rag/kb/${kbId}`, {
      method: 'DELETE',
    }),

  // Add document to knowledge base
  addDocument: (kbId: string, document: { title: string; content: string; type?: string; metadata?: Record<string, unknown> }) =>
    fetchApi<{ success: boolean; documentId: string; chunks: number }>(`/rag/kb/${kbId}/documents`, {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  // Upload file to knowledge base
  uploadFile: async (kbId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/rag/kb/${kbId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        return { data: null, error: data.error?.message || '上传失败' };
      }

      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : '网络错误',
      };
    }
  },

  // Retrieve knowledge
  retrieve: (kbId: string, query: string, topK = 5, similarityThreshold = 0.3) =>
    fetchApi<{ success: boolean; query: string; results: RetrieveResult[]; count: number }>(`/rag/kb/${kbId}/retrieve`, {
      method: 'POST',
      body: JSON.stringify({ query, topK, similarityThreshold }),
    }),

  // Get context for conversation
  getContext: (kbId: string, query: string, topK = 5, similarityThreshold = 0.3) =>
    fetchApi<{
      success: boolean;
      query: string;
      hasContext: boolean;
      context: string | null;
      sources: string[];
      count: number;
    }>(`/rag/kb/${kbId}/context`, {
      method: 'POST',
      body: JSON.stringify({ query, topK, similarityThreshold }),
    }),

  // Get RAG stats
  getStats: () =>
    fetchApi<{ success: boolean; stats: Record<string, unknown> }>('/rag/stats'),
};

// ============ Chat API ============

export const chatApi = {
  // Send message (uses SSE for streaming)
  sendMessage: async (
    message: string,
    onChunk: (chunk: string) => void,
    options?: {
      channel?: string;
      model?: string;
      conversationId?: string;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
        channel: options?.channel,
        model: options?.model,
        conversationId: options?.conversationId,
      }),
    });

    if (!response.ok) {
      throw new Error('请求失败');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('无法读取响应流');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              onChunk(parsed.content);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  },
};

// ============ Image Generation API ============

export interface ImageGenerationResult {
  base64?: string;
  url?: string;
  created_at?: number;
}

export const imageApi = {
  // 生成图片
  generate: (prompt: string, options?: { aspect_ratio?: string; response_format?: string }) =>
    fetchApi<ImageGenerationResult>('/image/generation', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        aspect_ratio: options?.aspect_ratio || '1:1',
        response_format: options?.response_format || 'url'
      }),
    }),
};

const api = {
  config: configApi,
  rag: ragApi,
  chat: chatApi,
  image: imageApi,
};

export default api;
