'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Search, Globe, ExternalLink, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export interface SearchResult {
  title: string;
  url: string;
  description?: string;
  snippet?: string;
  score?: number;
  source?: string;
  publishedDate?: string;
}

interface SearchResultsProps {
  query: string;
  results: SearchResult[];
  isLoading?: boolean;
  onResultClick?: (result: SearchResult) => void;
  onFetchContent?: (result: SearchResult) => void;
  expandedResult?: string | null;
  onToggleExpand?: (url: string) => void;
  fetchingContent?: string | null;
}

export default function SearchResults({
  query,
  results,
  isLoading,
  onResultClick,
  onFetchContent,
  expandedResult,
  onToggleExpand,
  fetchingContent,
}: SearchResultsProps) {
  return (
    <div className="space-y-4">
      {/* 搜索头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-[hsl(var(--text-main))]">
            搜索结果: &quot;{query}&quot;
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
            <Loader2 className="h-3 w-3 animate-spin" />
            搜索中...
          </div>
        )}
      </div>

      {/* 来源筛选 */}
      <div className="flex flex-wrap gap-2">
        <SourceBadge source="web" count={results.length} />
        <SourceBadge source="docs" />
        <SourceBadge source="academic" />
      </div>

      {/* 结果列表 */}
      <div className="space-y-3">
        <AnimatePresence mode="sync">
          {results.map((result, index) => (
            <SearchResultCard
              key={result.url}
              result={result}
              index={index}
              onClick={() => onResultClick?.(result)}
              onFetchContent={() => onFetchContent?.(result)}
              isExpanded={expandedResult === result.url}
              onToggle={() => onToggleExpand?.(result.url)}
              isFetching={fetchingContent === result.url}
            />
          ))}
        </AnimatePresence>

        {results.length === 0 && !isLoading && (
          <div className="text-center py-8 text-sm text-[hsl(var(--text-muted))]">
            未找到相关结果
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source, count }: { source: string; count?: number }) {
  const labels: Record<string, string> = { web: '网页', docs: '文档', academic: '学术' };
  const colors: Record<string, string> = {
    web: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    docs: 'bg-green-500/10 text-green-600 border-green-500/20',
    academic: 'bg-purple-500/10 text-purple-600 border-purple-500/20'
  };

  const icons: Record<string, string> = { web: '🌐', docs: '📖', academic: '📚' };

  return (
    <button
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium
        transition-colors hover:opacity-80
        ${colors[source] || colors.web}
      `}
    >
      <span>{icons[source] || '🌐'}</span>
      <span>{labels[source] || source}</span>
      {count !== undefined && (
        <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
          {count}
        </span>
      )}
    </button>
  );
}

function SearchResultCard({
  result,
  index,
  onClick,
  onFetchContent,
  isExpanded,
  onToggle,
  isFetching,
}: {
  result: SearchResult;
  index: number;
  onClick?: () => void;
  onFetchContent?: () => void;
  isExpanded: boolean;
  onToggle?: () => void;
  isFetching: boolean;
}) {
  // 提取域名
  const hostname = (() => {
    try {
      return new URL(result.url).hostname;
    } catch {
      return result.url;
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="group rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/95 p-4 transition-colors hover:border-[hsl(var(--border-strong))]"
    >
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              onClick?.();
            }}
            className="block truncate text-sm font-medium text-[hsl(var(--text-main))] hover:text-primary"
          >
            {result.title}
          </a>

          <div className="mt-1 flex items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
            <Globe className="h-3 w-3" />
            <span className="truncate">{hostname}</span>
            {result.publishedDate && (
              <>
                <span>·</span>
                <span>{result.publishedDate}</span>
              </>
            )}
            {result.score !== undefined && (
              <>
                <span>·</span>
                <span className="text-primary">{(result.score * 100).toFixed(0)}%</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onFetchContent && (
            <button
              onClick={onFetchContent}
              disabled={isFetching}
              className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))] disabled:opacity-50"
              title="抓取内容"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
            </button>
          )}

          {onToggle && (
            <button
              onClick={onToggle}
              className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition-colors hover:bg-[hsl(var(--bg-muted))] hover:text-[hsl(var(--text-main))]"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 摘要 */}
      {(result.description || result.snippet) && (
        <p className="mt-2 text-sm text-[hsl(var(--text-muted))] line-clamp-2">
          {result.description || result.snippet}
        </p>
      )}

      {/* 展开内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="rounded-lg bg-[hsl(var(--bg-muted))]/50 p-3 text-xs text-[hsl(var(--text-muted))]">
              {result.description ? (
                <p>{result.description}</p>
              ) : (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>正在加载内容...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
