// MiniMax 单一架构 - API 配置

export const PROVIDER_BASE_URLS = {
  // MiniMax Anthropic 兼容格式 (推荐)
  minimax: 'https://api.minimaxi.com/anthropic/v1',
} as const;

export type ProviderId = 'minimax';

export function getProviderFromModel(model: string): ProviderId {
  // 所有模型都使用 MiniMax
  return 'minimax';
}

export function getProviderFromBaseURL(baseURL?: string): ProviderId | null {
  if (!baseURL) return null;
  const url = baseURL.toLowerCase();
  if (url.includes('minimax') || url.includes('minimaxi')) return 'minimax';
  return null;
}

export function getBaseURLForProvider(provider: ProviderId): string {
  return PROVIDER_BASE_URLS[provider];
}

export function getBaseURLForModel(model: string): string {
  return PROVIDER_BASE_URLS.minimax;
}

export function isKnownProviderBaseURL(baseURL?: string): boolean {
  if (!baseURL) return false;
  const normalized = baseURL.toLowerCase();
  return normalized.includes('minimaxi') || normalized.includes('minimax');
}

export function resolveProvider(baseURL?: string, model?: string): ProviderId {
  return getProviderFromBaseURL(baseURL) || 'minimax';
}

export function syncBaseURLForPresetModel(model: string, currentBaseURL?: string): string {
  return PROVIDER_BASE_URLS.minimax;
}
