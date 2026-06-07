import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import MarkdownRenderer from '../MarkdownRenderer';

// Mock shiki
vi.mock('shiki', () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: vi.fn().mockReturnValue('<pre><code>test</code></pre>'),
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock document for theme detection
Object.defineProperty(document, 'documentElement', {
  value: {
    dataset: { themeResolved: 'light' },
  },
  writable: true,
});

// Mock window for setTimeout
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('渲染粗体', async () => {
    render(<MarkdownRenderer content="**粗体文本**" />);
    // Wait for render
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(screen.getByText('粗体文本')).toBeInTheDocument();
  });

  test('渲染代码块', async () => {
    render(<MarkdownRenderer content="```javascript\nconst x = 1;\n```" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(screen.getByText(/const x = 1;/)).toBeInTheDocument();
  });

  test('渲染链接', async () => {
    render(<MarkdownRenderer content="[百度](https://baidu.com)" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    const link = screen.getByText('百度');
    expect(link).toHaveAttribute('href', 'https://baidu.com');
  });

  test('渲染列表', async () => {
    render(<MarkdownRenderer content="- 项目1\n- 项目2" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    // 列表项会被合并渲染，使用正则匹配
    expect(screen.getByText(/项目1/)).toBeInTheDocument();
    expect(screen.getByText(/项目2/)).toBeInTheDocument();
  });

  test('XSS 防护', async () => {
    render(<MarkdownRenderer content='<script>alert("xss")</script>' />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });

  test('渲染斜体', async () => {
    render(<MarkdownRenderer content="*斜体文本*" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(screen.getByText('斜体文本')).toBeInTheDocument();
  });

  test('渲染标题', async () => {
    render(<MarkdownRenderer content="# 一级标题" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(screen.getByText('一级标题')).toBeInTheDocument();
  });

  test('渲染引用', async () => {
    render(<MarkdownRenderer content="> 这是一段引用" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(screen.getByText(/这是一段引用/)).toBeInTheDocument();
  });

  test('空内容不崩溃', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container).toBeTruthy();
  });

  test('处理混合内容', async () => {
    render(<MarkdownRenderer content="**粗体** 和 *斜体* 和 `代码`" />);
    await new Promise(resolve => originalSetTimeout(resolve, 100));
    expect(screen.getByText('粗体')).toBeInTheDocument();
    expect(screen.getByText('斜体')).toBeInTheDocument();
  });
});