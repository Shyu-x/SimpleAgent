import { Injectable } from '@nestjs/common';

export interface SearchProvider {
  id: string;
  name: string;
  requiresKey: boolean;
  enabled: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  query: string;
  provider: string;
}

@Injectable()
export class SearchService {
  private readonly searchProviders: SearchProvider[] = [
    { id: 'jina', name: 'Jina AI Search', requiresKey: false, enabled: true },
    { id: 'duckduckgo', name: 'DuckDuckGo', requiresKey: false, enabled: true },
    { id: 'tavily', name: 'Tavily', requiresKey: true, enabled: false },
    { id: 'perplexity', name: 'Perplexity', requiresKey: true, enabled: false },
    { id: 'brave', name: 'Brave Search', requiresKey: true, enabled: false },
    { id: 'minimax', name: 'MiniMax Search', requiresKey: true, enabled: false },
  ];

  private mockResults: SearchResult[] = [
    {
      title: '示例搜索结果 1',
      url: 'https://example.com/1',
      snippet: '这是第一个搜索结果的摘要内容',
      source: 'jina',
    },
    {
      title: '示例搜索结果 2',
      url: 'https://example.com/2',
      snippet: '这是第二个搜索结果的摘要内容',
      source: 'jina',
    },
    {
      title: '示例搜索结果 3',
      url: 'https://example.com/3',
      snippet: '这是第三个搜索结果的摘要内容',
      source: 'jina',
    },
  ];

  async searchWeb(query: string, limit: number = 10, source: string = 'jina'): Promise<SearchResponse> {
    // Return mock results for demonstration
    return {
      success: true,
      results: this.mockResults.slice(0, limit),
      total: this.mockResults.length,
      query,
      provider: source,
    };
  }

  formatResultsAsMarkdown(response: SearchResponse): string {
    if (!response.results || response.results.length === 0) {
      return 'No results found.';
    }

    let markdown = `## Search Results for "${response.query}"\n\n`;
    for (const result of response.results) {
      markdown += `### ${result.title}\n`;
      markdown += `**URL**: ${result.url}\n`;
      markdown += `**Snippet**: ${result.snippet}\n\n`;
    }
    return markdown;
  }

  getSearchProviders(): SearchProvider[] {
    return this.searchProviders;
  }

  getEnabledProviders(): SearchProvider[] {
    return this.searchProviders.filter((p) => p.enabled);
  }

  getSearchConfig(): Record<string, any> {
    const config: Record<string, any> = {};
    for (const provider of this.searchProviders) {
      config[provider.id] = {
        enabled: provider.enabled,
        requiresKey: provider.requiresKey,
        keyEnv: `SEARCH_${provider.id.toUpperCase()}_API_KEY`,
        name: provider.name,
      };
    }
    return config;
  }
}
