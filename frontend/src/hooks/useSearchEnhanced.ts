'use client';

import { useState, useCallback } from 'react';
import type { SearchResult } from '@/components/SearchResults';
import { BACKEND_URL } from '@/lib/config';

interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  query: string;
  error?: { message: string };
  errors?: Array<{ source: string; error: string }>;
  stats?: {
    providers: string[];
    totalSources: number;
    successfulSources: number;
    failedSources: number;
  };
}

interface UseSearchEnhancedOptions {
  backendUrl?: string;
}

interface SearchStats {
  providers?: string[];
  totalSources?: number;
  successfulSources?: number;
  failedSources?: number;
}

interface UseSearchEnhancedReturn {
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  expandedResult: string | null;
  fetchingContent: string | null;
  searchStats: SearchStats | null;
  search: (searchQuery: string, options?: { source?: string }) => Promise<void>;
  fetchContent: (result: SearchResult) => Promise<void>;
  toggleExpand: (url: string) => void;
  clear: () => void;
}

/**
 * 增强搜索 Hook
 * 提供并行搜索、内容抓取和结果管理功能
 */
export function useSearchEnhanced(options: UseSearchEnhancedOptions = {}): UseSearchEnhancedReturn {
  const backendUrl = options.backendUrl || BACKEND_URL;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [fetchingContent, setFetchingContent] = useState<string | null>(null);
  const [searchStats, setSearchStats] = useState<{
    providers?: string[];
    totalSources?: number;
    successfulSources?: number;
    failedSources?: number;
  } | null>(null);

  /**
   * 执行搜索
   */
  const search = useCallback(async (searchQuery: string, searchOptions?: { source?: string }) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setQuery(searchQuery);

    try {
      const response = await fetch(`${backendUrl}/api/search/enhanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          source: searchOptions?.source || 'web',
          sources: ['web'],
          count: 10
        })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResponse = await response.json();

      if (data.success) {
        setResults(data.results || []);
        setSearchStats(data.stats || null);

        if (data.errors && data.errors.length > 0) {
          console.warn('Search errors:', data.errors);
        }
      } else {
        throw new Error(data.error?.message || 'Search failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setResults([]);

      // 备用：尝试使用原有搜索 API
      try {
        const fallbackResponse = await fetch(`${backendUrl}/api/search/web`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            source: 'jina',
            count: 10
          })
        });

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData.success && fallbackData.results) {
            setResults(fallbackData.results.map((r: { title: string; url: string; snippet?: string }, i: number) => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              score: 1 - (i * 0.1),
              source: fallbackData.source || 'jina'
            })));
            setError(null);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
      }
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl]);

  /**
   * 抓取结果内容
   */
  const fetchContent = useCallback(async (result: SearchResult) => {
    setFetchingContent(result.url);

    try {
      const response = await fetch(`${backendUrl}/api/search/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.url,
          query: query
        })
      });

      if (!response.ok) {
        throw new Error('Fetch failed');
      }

      const data = await response.json();

      // 更新结果中的内容
      setResults(prev =>
        prev.map(r =>
          r.url === result.url
            ? { ...r, description: data.content || data.title }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to fetch content:', err);

      // 备用：使用 Jina Reader 直接抓取
      try {
        const fallbackResponse = await fetch(
          `https://r.jina.ai/${encodeURIComponent(result.url)}`,
          {
            headers: { 'Accept': 'application/json' }
          }
        );

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const content = fallbackData.content || fallbackData;

          setResults(prev =>
            prev.map(r =>
              r.url === result.url
                ? { ...r, description: typeof content === 'string' ? content.substring(0, 500) : content }
                : r
            )
          );
        }
      } catch (fallbackError) {
        console.error('Fallback fetch also failed:', fallbackError);
      }
    } finally {
      setFetchingContent(null);
    }
  }, [backendUrl, query]);

  /**
   * 切换结果展开状态
   */
  const toggleExpand = useCallback((url: string) => {
    setExpandedResult(prev => prev === url ? null : url);

    // 如果展开且没有内容，自动抓取
    if (expandedResult !== url) {
      const result = results.find(r => r.url === url);
      if (result && !result.description) {
        fetchContent(result);
      }
    }
  }, [expandedResult, results, fetchContent]);

  /**
   * 清除搜索结果
   */
  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    setExpandedResult(null);
    setSearchStats(null);
  }, []);

  return {
    query,
    results,
    isLoading,
    error,
    expandedResult,
    fetchingContent,
    searchStats,
    search,
    fetchContent,
    toggleExpand,
    clear
  };
}
