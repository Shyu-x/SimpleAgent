'use client';

import { useState, useCallback } from 'react';
import { API_ENDPOINTS } from '@/lib/apiConfig';

interface SearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface SearchResponse {
  success: boolean;
  query: string;
  count: number;
  results: SearchResult[];
  error?: string;
}

const API_BASE = API_ENDPOINTS.search;

export function useSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');

  // 执行搜索
  const search = useCallback(async (searchQuery: string, limit = 10) => {
    if (!searchQuery.trim()) return null;

    setIsLoading(true);
    setError(null);
    setQuery(searchQuery);

    try {
      const response = await fetch(`${API_BASE}/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit })
      });

      const data: SearchResponse = await response.json();

      if (data.success) {
        setResults(data.results);
        return data;
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      return { success: false, error: message, results: [] };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取 Markdown 格式结果
  const searchAsMarkdown = useCallback(async (searchQuery: string, limit = 10) => {
    if (!searchQuery.trim()) return null;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit, format: 'markdown' })
      });

      const data = await response.json();
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      return { success: false, markdown: '', error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 清除结果
  const clearResults = useCallback(() => {
    setResults([]);
    setQuery('');
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    results,
    query,
    search,
    searchAsMarkdown,
    clearResults,
  };
}

// 便捷组件：搜索按钮
export function SearchButton({ onSearch }: { onSearch: (query: string) => void }) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSearch(inputValue.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="搜索..."
        className="flex-1 px-3 py-2 border rounded-lg bg-background"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
      >
        搜索
      </button>
    </form>
  );
}
