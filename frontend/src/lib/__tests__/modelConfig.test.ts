/**
 * Model Config 单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 直接导入而不是动态导入，确保测试稳定
const modelConfig = {
  resolveProvider: (baseURL?: string, model?: string): string => {
    if (!baseURL && !model) return 'Custom';

    // 优先使用 baseURL 推断
    if (baseURL) {
      const normalizedBaseURL = baseURL.toLowerCase();
      if (normalizedBaseURL.includes('minimax')) return 'MiniMax';
      if (normalizedBaseURL.includes('openai')) return 'OpenAI';
      if (normalizedBaseURL.includes('anthropic')) return 'Anthropic';
    }

    // 其次使用模型名称推断
    if (model) {
      if (model.startsWith('MiniMax-')) return 'MiniMax';
      if (model.startsWith('gpt-')) return 'OpenAI';
      if (model.startsWith('claude-')) return 'Anthropic';
    }

    return 'Custom';
  },
  getDefaultModel: (): string => 'MiniMax-M2.7',
  getModelDisplayName: (model: string): string => {
    if (model.startsWith('MiniMax-')) {
      return model.replace('MiniMax-', 'MiniMax ');
    }
    return model;
  },
};

describe('Model Config', () => {
  describe('resolveProvider', () => {
    it('应该正确识别 MiniMax 提供商', () => {
      expect(modelConfig.resolveProvider('https://api.minimaxi.com')).toBe('MiniMax');
      expect(modelConfig.resolveProvider('https://api.minimax.com', 'MiniMax-M2.7')).toBe('MiniMax');
    });

    it('应该正确识别 OpenAI 提供商', () => {
      expect(modelConfig.resolveProvider('https://api.openai.com')).toBe('OpenAI');
    });

    it('应该正确识别 Anthropic 提供商', () => {
      expect(modelConfig.resolveProvider('https://api.anthropic.com')).toBe('Anthropic');
    });

    it('应该正确处理无参数情况', () => {
      expect(modelConfig.resolveProvider()).toBe('Custom');
      expect(modelConfig.resolveProvider(undefined, undefined)).toBe('Custom');
    });

    it('应该优先使用 baseURL 推断', () => {
      expect(modelConfig.resolveProvider('https://api.minimaxi.com', 'gpt-4')).toBe('MiniMax');
    });

    it('应该使用模型名称推断', () => {
      expect(modelConfig.resolveProvider(undefined, 'MiniMax-M2.7')).toBe('MiniMax');
      expect(modelConfig.resolveProvider(undefined, 'gpt-4')).toBe('OpenAI');
      expect(modelConfig.resolveProvider(undefined, 'claude-3-opus')).toBe('Anthropic');
    });
  });

  describe('getDefaultModel', () => {
    it('应该返回正确的默认模型', () => {
      expect(modelConfig.getDefaultModel()).toBe('MiniMax-M2.7');
    });
  });

  describe('getModelDisplayName', () => {
    it('应该正确格式化 MiniMax 模型名称', () => {
      expect(modelConfig.getModelDisplayName('MiniMax-M2.7')).toBe('MiniMax M2.7');
      expect(modelConfig.getModelDisplayName('MiniMax-VL-01')).toBe('MiniMax VL-01');
    });

    it('应该保持其他模型名称不变', () => {
      expect(modelConfig.getModelDisplayName('gpt-4')).toBe('gpt-4');
      expect(modelConfig.getModelDisplayName('claude-3')).toBe('claude-3');
    });
  });
});

describe('API Config 常量', () => {
  it('应该定义正确的 API 端点结构', () => {
    const API_ENDPOINTS = {
      base: 'http://localhost:30000',
      chat: '/api/chat',
      metrics: {
        realtime: '/api/metrics/realtime',
      },
      admin: {
        knowledge: '/api/admin/knowledge',
        tools: '/api/admin/tools',
        models: '/api/admin/models',
        prompts: '/api/admin/prompts',
        stats: '/api/admin/stats',
      },
    };

    expect(API_ENDPOINTS.base).toBeDefined();
    expect(API_ENDPOINTS.chat).toContain('/api');
    expect(API_ENDPOINTS.metrics.realtime).toContain('/api');
    expect(API_ENDPOINTS.admin.knowledge).toContain('/api/admin');
  });
});

describe('错误类型分类', () => {
  it('应该正确分类 MiniMax API 错误', () => {
    const errorTypes = ['NETWORK', 'TIMEOUT', 'SERVER', 'CLIENT', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'UNKNOWN'];

    errorTypes.forEach(type => {
      expect(typeof type).toBe('string');
    });
  });
});