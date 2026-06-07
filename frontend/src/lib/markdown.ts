import { memo } from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';

// 避免 MarkdownRenderer 在流式更新期间每字符重渲染
export const MemoizedMarkdownRenderer = memo(MarkdownRenderer);