'use client';

import { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createHighlighter, type Highlighter } from 'shiki';
import DOMPurify from 'dompurify';
import { Check, Copy, Eye, X, ZoomIn, ZoomOut, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './code-highlight.css';

// 数学公式检测正则 - 检测 $...$, $$...$$, \[...\], \(...\), \begin{equation}
const MATH_PATTERN = /\$(?:\$[\s\S]+?\$|\s*\S[^$]*\S\s*\$)|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\\begin\{(?:equation|align|math)\}/;

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onPreviewLink?: (url: string, title?: string) => void;
}

// Create a global highlighter instance
let highlighter: Highlighter | null = null;
let highlighterInitPromise: Promise<Highlighter> | null = null;
const HIGHLIGHT_DEBOUNCE_MS = 90;

// 常用语言子集 (减少 bundle 大小 ~500KB)
// 仅加载最常用的语言，其他语言 fallback 到纯文本
const COMMON_LANGS = [
  'javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust',
  'html', 'css', 'json', 'yaml', 'bash', 'shell', 'sql', 'jsx', 'tsx'
];

// Katex 懒加载模块
let katexModules: {
  remarkMath: unknown;
  rehypeKatex: unknown;
} | null = null;

async function loadKatexModules() {
  if (!katexModules) {
    const [remarkMathModule, rehypeKatexModule] = await Promise.all([
      import('remark-math'),
      import('rehype-katex'),
    ]);
    katexModules = {
      remarkMath: remarkMathModule.default,
      rehypeKatex: rehypeKatexModule.default,
    };
  }
  return katexModules;
}

async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;

  if (!highlighterInitPromise) {
    highlighterInitPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: COMMON_LANGS,
    }).catch((err) => {
      highlighterInitPromise = null;
      throw err;
    });
  }

  highlighter = await highlighterInitPromise;
  return highlighter;
}

function resolveShikiTheme(): 'github-dark' | 'github-light' {
  if (typeof document === 'undefined') {
    return 'github-light';
  }
  const root = document.documentElement;
  const resolved = root.dataset.themeResolved;
  return resolved === 'dark' ? 'github-dark' : 'github-light';
}

function sanitizeShikiHtmlBackground(html: string): string {
  // Avoid dark inline backgrounds from shiki during streaming updates.
  return html
    .replace(/background-color\s*:[^;"]+;?/gi, 'background-color: transparent;')
    .replace(/background\s*:[^;"]+;?/gi, 'background: transparent;')
    .replace(/color-scheme\s*:[^;"]+;?/gi, '');
}

// HTML预览组件
const HtmlPreview = memo(function HtmlPreview({
  html,
  onClose,
}: {
  html: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const iframeContent = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ${html.includes('<style') ? '' : 'body { background: hsl(var(--bg-surface)); color: hsl(var(--text-main)); }'}
  </style>
</head>
<body>
${html}
</body>
</html>`;
  }, [html]);

  const scaledWidth = isFullscreen ? '100%' : `${zoom}%`;
  const scaledHeight = isFullscreen ? '100%' : '500px';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className={`bg-background rounded-xl overflow-hidden shadow-2xl ${
          isFullscreen ? 'w-full h-full' : 'w-full max-w-4xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">HTML 预览</span>
          </div>
          <div className="flex items-center gap-1">
            {/* 缩放控制 */}
            <button
              onClick={() => setZoom(Math.max(50, zoom - 25))}
              className="p-1.5 rounded hover:bg-muted"
              title="缩小"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 25))}
              className="p-1.5 rounded hover:bg-muted"
              title="放大"
            >
              <ZoomIn size={16} />
            </button>

            <div className="w-px h-4 bg-border mx-1" />

            {/* 全屏切换 */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded hover:bg-muted"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <div className="w-px h-4 bg-border mx-1" />

            {/* 关闭 */}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 预览区域 */}
        <div className={`${isFullscreen ? 'h-[calc(100vh-60px)]' : 'h-[500px]'} overflow-auto bg-[hsl(var(--bg-surface))]`}>
          <iframe
            srcDoc={iframeContent}
            className="w-full h-full border-0 transition-all duration-200"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
              width: scaledWidth,
              height: scaledHeight,
            }}
            sandbox="allow-scripts allow-same-origin"
            title="HTML Preview"
          />
        </div>
      </motion.div>
    </motion.div>
  );
});

// 代码块复制按钮组件
const CodeBlock = memo(function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const hasHighlightRef = useRef(false);
  const isHtml = language.toLowerCase() === 'html' || language.toLowerCase() === 'htm';

  // 使用shiki进行语法高亮
  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const hl = await getHighlighter();
        if (cancelled) return;

        const lang = language || 'text';
        // 未知语言 fallback 到纯文本显示
        const isKnownLang = lang !== 'text' && COMMON_LANGS.includes(lang);

        const html = hl.codeToHtml(children, {
          lang: isKnownLang ? lang : 'text',
          theme: resolveShikiTheme(),
        });
        if (!cancelled) {
          setHighlightedHtml(sanitizeShikiHtmlBackground(html));
          hasHighlightRef.current = true;
        }
      } catch (error) {
        // Fallback to plain text
        if (!cancelled) {
          setHighlightedHtml(`<pre><code>${children.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
          hasHighlightRef.current = true;
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    if (!hasHighlightRef.current) {
      setIsLoading(true);
    }
    const timer = window.setTimeout(highlight, HIGHLIGHT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [children, language]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-4 overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-surface))]/95">
      {/* 语言标签和复制按钮 */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/90 px-3 py-1.5">
        <span className="font-mono text-xs uppercase text-[hsl(var(--text-muted))]">
          {language || 'text'}
        </span>
        <div className="flex items-center gap-1">
          {/* HTML预览按钮 */}
          {isHtml && (
            <button
              onClick={() => setShowHtmlPreview(true)}
              className="flex items-center gap-1 rounded bg-[hsl(var(--bg-surface))]/70 px-2 py-0.5 text-xs text-[hsl(var(--text-muted))] opacity-0 transition-colors group-hover:opacity-100 hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-main))]"
              aria-label="预览HTML"
            >
              <Eye size={12} />
              <span>预览</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded bg-[hsl(var(--bg-surface))]/70 px-2 py-0.5 text-xs text-[hsl(var(--text-muted))] opacity-0 transition-colors group-hover:opacity-100 hover:bg-[hsl(var(--bg-surface))] hover:text-[hsl(var(--text-main))]"
            aria-label="复制代码"
          >
            {copied ? (
              <>
                <Check size={12} className="text-[hsl(var(--success-500))]" />
                <span className="text-[hsl(var(--success-500))]">已复制</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>复制</span>
              </>
            )}
          </button>
        </div>
      </div>
      {/* 代码内容 - 使用shiki高亮，添加行号 */}
      <div className="flex overflow-x-auto">
        {/* 行号列 */}
        <div className="flex-shrink-0 select-none border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-muted))]/85 py-4 pl-4 pr-3 text-right">
          {children.split('\n').map((_, i) => (
            <div key={i} className="text-xs font-mono leading-6 text-[hsl(var(--text-muted))]">
              {i + 1}
            </div>
          ))}
        </div>
        {/* 代码内容 */}
        <div className="flex-1 overflow-x-auto p-4 text-xs font-mono leading-6">
          {isLoading ? (
            <pre className="text-[hsl(var(--text-muted))] whitespace-pre">
              <code>{children}</code>
            </pre>
          ) : (
            <div
              className="shiki-container"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              style={{ background: 'transparent' }}
            />
          )}
        </div>
      </div>

      {/* HTML预览模态框 */}
      <AnimatePresence>
        {showHtmlPreview && (
          <HtmlPreview
            html={children}
            onClose={() => setShowHtmlPreview(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

// 内联代码组件
const InlineCode = memo(function InlineCode({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">
      {children}
    </code>
  );
});

// XSS安全过滤配置
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'strong', 'em', 'del', 'ins', 's',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'sub', 'sup',
  'kbd', 'abbr',
  'input',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title',
  'class', 'id',
  'type', 'checked', 'disabled',
  'colspan', 'rowspan',
];

// 主渲染器组件
const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className='',
  onPreviewLink,
}: MarkdownRendererProps) {
  // 检测是否有数学公式
  const hasMath = useMemo(() => MATH_PATTERN.test(content), [content]);

  // 动态加载的插件状态
  const [mathPlugins, setMathPlugins] = useState<{ remarkPlugins: any[]; rehypePlugins: any[] }>({
    remarkPlugins: [remarkGfm],
    rehypePlugins: [],
  });
  const [isLoadingMath, setIsLoadingMath] = useState(false);

  // 当检测到数学公式时，懒加载 Katex
  useEffect(() => {
    if (hasMath && mathPlugins.rehypePlugins.length === 0 && !isLoadingMath) {
      setIsLoadingMath(true);
      loadKatexModules().then(modules => {
        setMathPlugins({
          remarkPlugins: [remarkGfm, modules.remarkMath],
          rehypePlugins: [modules.rehypeKatex],
        });
        setIsLoadingMath(false);
      }).catch(() => {
        setIsLoadingMath(false);
      });
    }
  }, [hasMath]);

  // 安全过滤内容
  const sanitizedContent = useMemo(() => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    });
  }, [content]);

  return (
    <div className={`markdown-content ${className}`}>
      {/* 数学公式加载提示 */}
      {hasMath && isLoadingMath && (
        <div className="text-xs text-muted-foreground mb-2">加载数学公式渲染器...</div>
      )}
      <ReactMarkdown
        remarkPlugins={mathPlugins.remarkPlugins}
        rehypePlugins={mathPlugins.rehypePlugins}
        components={{
          // 代码块
          code({ className, children, node, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;
            const codeContent = String(children).replace(/\n$/, '');

            if (isInline) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match?.[1] || ''}>
                {codeContent}
              </CodeBlock>
            );
          },

          // 链接
          a({ href, children, ...props }) {
            const handleClick = (e: React.MouseEvent) => {
              if (href && onPreviewLink) {
                e.preventDefault();
                onPreviewLink(href, typeof children === 'string' ? children : undefined);
              }
            };

            return (
              <a
                href={href}
                {...props}
                onClick={handleClick}
                className="cursor-pointer text-[hsl(var(--brand-500))] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },

          // 标题
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground border-b border-border pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-5 mb-2 text-foreground border-b border-border pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold mt-3 mb-2 text-foreground">
              {children}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-medium mt-2 mb-1 text-foreground">
              {children}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-xs font-medium mt-2 mb-1 text-muted-foreground">
              {children}
            </h6>
          ),

          // 段落
          p: ({ children }) => (
            <p className="my-3 text-sm leading-7 text-foreground">
              {children}
            </p>
          ),

          // 列表
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-3 space-y-1 text-foreground marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-3 space-y-1 text-foreground marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => {
            return (
              <li className="text-foreground my-1" {...props}>
                {children}
              </li>
            );
          },

          // 引用
          blockquote: ({ children }) => (
            <blockquote className="blockquote">
              {children}
            </blockquote>
          ),

          // 表格
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="markdown-table">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead>{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody>{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr>{children}</tr>
          ),
          th: ({ children }) => (
            <th>{children}</th>
          ),
          td: ({ children }) => (
            <td>{children}</td>
          ),

          // 分隔线
          hr: () => <hr className="my-6 border-t border-border" />,

          // 强调
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground">{children}</em>
          ),

          // 上标/下标
          sup: ({ children }) => (
            <sup className="text-xs text-muted-foreground ml-1">{children}</sup>
          ),
          sub: ({ children }) => (
            <sub className="text-xs text-muted-foreground ml-1">{children}</sub>
          ),

          // 删除线
          del: ({ children }) => (
            <del className="line-through text-muted-foreground">{children}</del>
          ),

          // 键盘按键
          kbd: ({ children }) => (
            <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-xs font-mono text-muted-foreground">
              {children}
            </kbd>
          ),

          // 缩写
          abbr: ({ children, title }) => (
            <abbr
              title={title}
              className="cursor-help border-b border-dotted border-muted-foreground"
            >
              {children}
            </abbr>
          ),

          // 任务列表
          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 accent-blue-500"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;