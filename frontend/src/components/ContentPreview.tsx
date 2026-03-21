'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ExternalLink,
  Download,
  Expand,
  Minimize2,
  FileText,
  Globe,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// 预览类型
export type PreviewType = 'document' | 'webpage';

// 预览配置
export interface PreviewConfig {
  type: PreviewType;
  url: string;
  title?: string;
  fileType?: string; // pdf, docx, xlsx, etc.
  fileSize?: number;
}

// 组件属性
interface ContentPreviewProps {
  config: PreviewConfig | null;
  onClose: () => void;
  className?: string;
}

// 加载状态组件
const LoadingState = memo(function LoadingState({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <Loader2 size={32} className="animate-spin mb-4" />
      <p className="text-sm">{message}</p>
    </div>
  );
});

// 错误状态组件
const ErrorState = memo(function ErrorState({ message = '加载失败' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <AlertCircle size={32} className="text-destructive mb-4" />
      <p className="text-sm">{message}</p>
    </div>
  );
});

// 文档预览组件
const DocumentPreview = memo(function DocumentPreview({
  url,
  fileType,
  title,
}: {
  url: string;
  fileType?: string;
  title?: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setError('无法加载文档，请尝试下载后查看');
  }, []);

  // 预览URL，使用Google文档预览服务
  const previewUrl = fileType === 'pdf'
    ? url
    : `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="relative w-full">
      {isLoading && <LoadingState message="加载文档中..." />}
      <iframe
        src={previewUrl}
        className="w-full h-[500px] border-0 rounded-lg"
        onLoad={handleLoad}
        onError={handleError}
        style={{ display: isLoading ? 'none' : 'block' }}
        title={title || 'Document Preview'}
      />
    </div>
  );
});

// 网页预览组件
const WebpagePreview = memo(function WebpagePreview({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setError('无法加载网页，可能是目标网站禁止嵌入');
  }, []);

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="relative w-full">
      {isLoading && <LoadingState message="加载网页中..." />}
      <iframe
        src={url}
        className="w-full h-[500px] border-0 rounded-lg bg-background"
        onLoad={handleLoad}
        onError={handleError}
        style={{ display: isLoading ? 'none' : 'block' }}
        title={title || 'Webpage Preview'}
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
      />
    </div>
  );
});

// 主预览组件
const ContentPreview = memo(function ContentPreview({
  config,
  onClose,
  className='',
}: ContentPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    // 重置状态当配置变化
    setIsExpanded(false);
    setIsMinimized(false);
  }, [config]);

  if (!config) return null;

  const isDocument = config.type === 'document';
  const Icon = isDocument ? FileText : Globe;
  const typeLabel = isDocument ? '文档' : '网页';

  return (
    <AnimatePresence mode="wait">
      {!isMinimized && (
        <motion.div
          className={`bg-background border rounded-xl overflow-hidden shadow-lg ${className} ${
            isExpanded ? 'fixed inset-4 z-[100] m-0' : 'w-full max-w-3xl mx-auto my-2'
          }`}
          initial={{ opacity: 0, height: 0, y: -20 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          layout
        >
          {/* 头部 */}
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${
                isDocument ? 'bg-primary/10 text-primary' :
                'bg-[hsl(var(--accent-500))/0.16] text-[hsl(var(--accent-500))]'
              }`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {config.title || `${typeLabel}预览`}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {config.url}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* 最小化 */}
              {!isExpanded && (
                <motion.button
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="最小化"
                >
                  <ChevronDown size={14} />
                </motion.button>
              )}

              {/* 展开/收起 */}
              <motion.button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title={isExpanded ? '收起' : '全屏'}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Expand size={14} />}
              </motion.button>

              {/* 外部打开 */}
              <motion.a
                href={config.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="在新窗口打开"
              >
                <ExternalLink size={14} />
              </motion.a>

              {/* 下载 */}
              {isDocument && (
                <motion.a
                  href={config.url}
                  download
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="下载文件"
                >
                  <Download size={14} />
                </motion.a>
              )}

              {/* 关闭 */}
              <motion.button
                onClick={onClose}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="关闭预览"
              >
                <X size={14} />
              </motion.button>
            </div>
          </div>

          {/* 内容区域 */}
          <div className={`p-3 ${isExpanded ? 'h-[calc(100vh-80px)] overflow-hidden' : 'overflow-auto'}`}>
            {isDocument ? (
              <DocumentPreview
                url={config.url}
                fileType={config.fileType}
                title={config.title}
              />
            ) : (
              <WebpagePreview
                url={config.url}
                title={config.title}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* 最小化状态 */}
      {isMinimized && (
        <motion.div
          className="bg-background border rounded-lg shadow-lg w-full max-w-md mx-auto my-2"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          <div
            className="flex items-center justify-between p-3 cursor-pointer"
            onClick={() => setIsMinimized(false)}
          >
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-6 h-6 rounded ${
                isDocument ? 'bg-primary/10 text-primary' : 'bg-[hsl(var(--accent-500))/0.16] text-[hsl(var(--accent-500))]'
              }`}>
                <Icon size={12} />
              </div>
              <span className="text-sm font-medium truncate max-w-[200px]">
                {config.title || `${typeLabel}预览`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(false);
                }}
                className="p-1.5 rounded hover:bg-muted"
                title="展开"
              >
                <ChevronUp size={14} />
              </motion.button>
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded hover:bg-muted"
                title="关闭"
              >
                <X size={14} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// 链接检测和预览触发器钩子
export function useContentPreview() {
  const [previewConfig, setPreviewConfig] = useState<PreviewConfig | null>(null);

  // 检测链接类型
  const detectLinkType = useCallback((url: string): PreviewType => {
    // 文档扩展名
    const docExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'];
    const lowerUrl = url.toLowerCase();

    if (docExtensions.some(ext => lowerUrl.includes(ext))) {
      return 'document';
    }

    // 网页
    return 'webpage';
  }, []);

  // 获取文件类型
  const getFileType = useCallback((url: string): string | undefined => {
    const match = url.match(/\.(\w+)(?:\?|#|$)/i);
    return match ? match[1].toLowerCase() : undefined;
  }, []);

  // 触发预览
  const triggerPreview = useCallback((url: string, title?: string) => {
    const type = detectLinkType(url);
    const fileType = getFileType(url);

    setPreviewConfig({
      type,
      url,
      title,
      fileType,
    });
  }, [detectLinkType, getFileType]);

  // 关闭预览
  const closePreview = useCallback(() => {
    setPreviewConfig(null);
  }, []);

  return {
    previewConfig,
    triggerPreview,
    closePreview,
  };
}

export default ContentPreview;
