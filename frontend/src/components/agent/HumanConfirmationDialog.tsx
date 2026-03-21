'use client';

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  FileText,
  Code,
  Database,
  Globe,
  Shield,
  Zap,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  Keyboard,
  Timer,
  Target,
  TrendingUp,
  Layers,
  BellOff,
  Info
} from 'lucide-react';

// 风险等级
export type RiskLevel = 'high' | 'medium' | 'low';

// 确认类型
export type ConfirmationType =
  | 'action'           // 一般操作确认
  | 'permission'       // 权限请求
  | 'data_access'      // 数据访问
  | 'external_call'    // 外部调用
  | 'file_operation'   // 文件操作
  | 'code_execution'   // 代码执行
  | 'cost_warning'     // 成本警告
  | 'sensitive_data';  // 敏感数据

// 操作影响范围
export interface OperationImpact {
  scope?: string;           // 影响范围描述
  affectedFiles?: string[]; // 受影响文件
  affectedSystems?: string[]; // 受影响系统
  dataChanges?: string;    // 数据变更说明
  sideEffects?: string[];  // 副作用说明
}

// 确认选项
export interface ConfirmationOption {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  style?: 'default' | 'primary' | 'danger' | 'warning';
  value: unknown;
}

// 确认请求接口
export interface ConfirmationRequest {
  id: string;
  type: ConfirmationType;
  title: string;
  message: string;
  details?: string;
  code?: string;
  dataPreview?: string;
  options: ConfirmationOption[];
  timeout?: number; // 超时时间（秒）
  agentId?: string;
  agentName?: string;
  taskId?: string;
  allowSkip?: boolean;
  requireInput?: boolean;
  inputPlaceholder?: string;
  sensitiveFields?: string[];

  // 新增字段
  riskLevel?: RiskLevel;         // 风险等级
  estimatedTime?: string;        // 预计执行时间
  impact?: OperationImpact;      // 操作影响范围
  command?: string;              // 将要执行的命令
  warnings?: string[];           // 警告信息
  skipSimilar?: boolean;         // 对同类操作不再提示
  similarOperationKey?: string;  // 用于判断同类操作的key
}

// 确认响应接口
export interface ConfirmationResponse {
  requestId: string;
  selectedOption: string;
  inputValue?: string;
  timestamp: string;
  skipSimilar?: boolean;  // 不再提示同类操作
}

// 风险等级配置
const riskConfig: Record<RiskLevel, {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  labelColor: string;
}> = {
  high: {
    icon: <AlertTriangle size={14} />,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30',
    label: '高风险',
    labelColor: 'text-destructive'
  },
  medium: {
    icon: <AlertCircle size={14} />,
    color: 'text-[hsl(var(--warning-500))]',
    bgColor: 'bg-[hsl(var(--warning-500))]/10',
    borderColor: 'border-[hsl(var(--warning-500))]/30',
    label: '中风险',
    labelColor: 'text-[hsl(var(--warning-500))]'
  },
  low: {
    icon: <CheckCircle size={14} />,
    color: 'text-[hsl(var(--success-500))]',
    bgColor: 'bg-[hsl(var(--success-500))]/10',
    borderColor: 'border-[hsl(var(--success-500))]/30',
    label: '低风险',
    labelColor: 'text-[hsl(var(--success-500))]'
  }
};

// 类型配置
const typeConfig: Record<ConfirmationType, { icon: React.ReactNode; color: string; label: string }> = {
  action: { icon: <Zap size={18} />, color: 'text-primary', label: '操作确认' },
  permission: { icon: <Shield size={18} />, color: 'text-[hsl(var(--accent-500))]', label: '权限请求' },
  data_access: { icon: <Database size={18} />, color: 'text-[hsl(var(--info-500))]', label: '数据访问' },
  external_call: { icon: <Globe size={18} />, color: 'text-[hsl(var(--warning-500))]', label: '外部调用' },
  file_operation: { icon: <FileText size={18} />, color: 'text-[hsl(var(--success-500))]', label: '文件操作' },
  code_execution: { icon: <Code size={18} />, color: 'text-destructive', label: '代码执行' },
  cost_warning: { icon: <AlertCircle size={18} />, color: 'text-[hsl(var(--warning-500))]', label: '成本警告' },
  sensitive_data: { icon: <EyeOff size={18} />, color: 'text-[hsl(var(--error-500))]', label: '敏感数据' },
};

// 动画变体
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};

const dialogVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.15 }
  }
} as const;

// 人机协作确认对话框
interface HumanConfirmationDialogProps {
  request: ConfirmationRequest;
  onConfirm: (response: ConfirmationResponse) => void;
  onDismiss?: () => void;
  defaultExpanded?: boolean;
}

const HumanConfirmationDialog = memo(function HumanConfirmationDialog({
  request,
  onConfirm,
  onDismiss,
  defaultExpanded = false,
}: HumanConfirmationDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showDetails, setShowDetails] = useState(defaultExpanded);
  const [showSensitive, setShowSensitive] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(request.timeout);
  const [skipSimilar, setSkipSimilar] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const lastOptionRef = useRef<HTMLButtonElement>(null);

  const config = typeConfig[request.type];
  const risk = request.riskLevel ? riskConfig[request.riskLevel] : null;
  const progressPercent = request.timeout && timeLeft !== undefined
    ? (timeLeft / request.timeout) * 100
    : 100;

  // 倒计时
  useEffect(() => {
    if (request.timeout && timeLeft && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (request.timeout && timeLeft === 0) {
      // 超时处理：选择默认选项或取消
      const defaultOption = request.options[0]?.id;
      if (defaultOption) {
        handleConfirm(defaultOption);
      } else {
        onDismiss?.();
      }
    }
  }, [request.timeout, timeLeft]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果有输入框聚焦，不处理快捷键
      if (document.activeElement?.tagName === 'TEXTAREA' ||
          document.activeElement?.tagName === 'INPUT') {
        return;
      }

      const key = e.key.toLowerCase();

      // Y 键 - 确认第一个选项
      if (key === 'y' || key === 'Y') {
        e.preventDefault();
        const confirmOption = request.options.find(o => o.style === 'primary' || o.style === 'danger') || request.options[0];
        if (confirmOption) {
          handleConfirm(confirmOption.id);
        }
      }

      // N 键 - 取消/拒绝
      if (key === 'n' || key === 'N') {
        e.preventDefault();
        const rejectOption = request.options.find(o => o.id === 'reject' || o.id === 'cancel' || o.style === 'default');
        if (rejectOption) {
          handleConfirm(rejectOption.id);
        } else {
          onDismiss?.();
        }
      }

      // ESC 键 - 关闭对话框
      if (key === 'escape') {
        e.preventDefault();
        onDismiss?.();
      }

      // Tab 键在选项间切换
      if (key === 'tab' && request.options.length > 1) {
        e.preventDefault();
        const currentIndex = selectedOption
          ? request.options.findIndex(o => o.id === selectedOption)
          : -1;
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + request.options.length) % request.options.length
          : (currentIndex + 1) % request.options.length;
        setSelectedOption(request.options[nextIndex].id);
      }

      // Enter 键 - 确认当前选择
      if (key === 'enter' && selectedOption) {
        e.preventDefault();
        handleConfirm(selectedOption);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request, selectedOption, onDismiss]);

  // 将同类操作key存入 localStorage
  const handleConfirm = useCallback((optionId: string) => {
    setSelectedOption(optionId);

    // 如果勾选了"不再提示"，存储到 localStorage
    if (skipSimilar && request.similarOperationKey) {
      try {
        const skipped = JSON.parse(localStorage.getItem('hitl_skipped_operations') || '{}');
        skipped[request.similarOperationKey] = Date.now();
        localStorage.setItem('hitl_skipped_operations', JSON.stringify(skipped));
      } catch {
        // Handle error silently
      }
    }

    const response: ConfirmationResponse = {
      requestId: request.id,
      selectedOption: optionId,
      inputValue: request.requireInput ? inputValue : undefined,
      timestamp: new Date().toISOString(),
      skipSimilar,
    };
    // 延迟关闭以显示动画
    setTimeout(() => {
      onConfirm(response);
    }, 200);
  }, [request, inputValue, onConfirm, skipSimilar]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Handle error silently
    }
  }, []);

  // 检查敏感字段
  const containsSensitiveData = request.sensitiveFields && request.sensitiveFields.length > 0;
  const displayData = containsSensitiveData && !showSensitive
    ? '••••••••••'
    : request.dataPreview;

  const hasImpact = request.impact && (
    request.impact.scope ||
    request.impact.affectedFiles?.length ||
    request.impact.affectedSystems?.length ||
    request.impact.dataChanges ||
    request.impact.sideEffects?.length
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onDismiss}
    >
      <motion.div
        className="w-full max-w-xl bg-background rounded-2xl shadow-2xl overflow-hidden border border-muted/50"
        variants={dialogVariants}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-start gap-3 p-5 border-b">
          <motion.div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${risk ? risk.bgColor : 'bg-muted'} ${config.color}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
          >
            {config.icon}
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
              {request.agentName && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{request.agentName}</span>
              )}
              {/* 风险等级标签 */}
              {risk && (
                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${risk.bgColor} ${risk.labelColor} border ${risk.borderColor}`}>
                  {risk.icon}
                  {risk.label}
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold">{request.title}</h3>
          </div>

          {/* 超时计时器 */}
          {request.timeout && timeLeft !== undefined && timeLeft > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-muted"
                  />
                  <circle
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${progressPercent} 100`}
                    strokeLinecap="round"
                    className={timeLeft <= 10 ? 'text-destructive' : 'text-primary'}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-medium ${timeLeft <= 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {timeLeft}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 进度条 */}
        {request.timeout && timeLeft !== undefined && timeLeft > 0 && (
          <div className="h-0.5 bg-muted/30">
            <motion.div
              className={`h-full transition-all duration-1000 ease-linear ${timeLeft <= 10 ? 'bg-destructive' : 'bg-primary'}`}
              initial={{ width: '100%' }}
              animate={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* 内容 */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-foreground/80 mb-4">{request.message}</p>

          {/* 预计执行时间 */}
          {request.estimatedTime && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <Timer size={14} />
              <span>预计执行时间: <span className="font-medium text-foreground">{request.estimatedTime}</span></span>
            </div>
          )}

          {/* 警告信息 */}
          {request.warnings && request.warnings.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowWarning(!showWarning)}
                className={`flex items-center gap-2 text-xs font-medium w-full p-2 rounded-lg border transition-colors ${
                  showWarning
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : 'bg-muted/30 border-muted hover:border-muted-foreground/30'
                }`}
              >
                <AlertTriangle size={14} />
                <span>{request.warnings.length} 条警告信息</span>
                {showWarning ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
              </button>
              <AnimatePresence>
                {showWarning && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <ul className="mt-2 space-y-1.5 pl-2">
                      {request.warnings.map((warning, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-destructive/80">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 命令预览 */}
          {request.command && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Target size={12} />
                  操作命令
                </div>
                <button
                  onClick={() => handleCopy(request.command || '')}
                  className="p-1 hover:bg-muted rounded transition-colors"
                  title="复制命令"
                >
                  {copied ? <Check size={12} className="text-[hsl(var(--success-500))]" /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto border border-muted">
                <code className="text-primary">{request.command}</code>
              </pre>
            </div>
          )}

          {/* 操作影响范围 */}
          {hasImpact && (
            <div className="mb-4">
              <button
                onClick={() => setShowImpact(!showImpact)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showImpact ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Layers size={12} />
                操作影响范围
              </button>
              <AnimatePresence>
                {showImpact && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pl-4 space-y-2 text-xs">
                      {request.impact?.scope && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0">范围:</span>
                          <span className="text-foreground">{request.impact.scope}</span>
                        </div>
                      )}
                      {request.impact?.affectedFiles?.length && (
                        <div>
                          <span className="text-muted-foreground">受影响文件:</span>
                          <ul className="mt-1 pl-4 space-y-0.5">
                            {request.impact.affectedFiles.map((file, i) => (
                              <li key={i} className="text-foreground/80 font-mono">{file}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {request.impact?.affectedSystems?.length && (
                        <div>
                          <span className="text-muted-foreground">受影响系统:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {request.impact.affectedSystems.map((sys, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-foreground/80">{sys}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {request.impact?.dataChanges && (
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground shrink-0">数据变更:</span>
                          <span className="text-foreground">{request.impact.dataChanges}</span>
                        </div>
                      )}
                      {request.impact?.sideEffects?.length && (
                        <div>
                          <span className="text-muted-foreground">可能的副作用:</span>
                          <ul className="mt-1 pl-4 space-y-0.5">
                            {request.impact.sideEffects.map((effect, i) => (
                              <li key={i} className="text-[hsl(var(--warning-500))]">• {effect}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 数据预览 */}
          {request.dataPreview && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">数据预览</span>
                <div className="flex items-center gap-1">
                  {containsSensitiveData && (
                    <button
                      onClick={() => setShowSensitive(!showSensitive)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      title={showSensitive ? '隐藏敏感数据' : '显示敏感数据'}
                    >
                      {showSensitive ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(request.dataPreview || '')}
                    className="p-1 hover:bg-muted rounded transition-colors"
                    title="复制"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
              <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-32">
                <code>{displayData}</code>
              </pre>
            </div>
          )}

          {/* 代码预览 */}
          {request.code && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">代码</span>
                <button
                  onClick={() => handleCopy(request.code || '')}
                  className="p-1 hover:bg-muted rounded transition-colors"
                  title="复制代码"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
              <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-40">
                <code>{request.code}</code>
              </pre>
            </div>
          )}

          {/* 详细信息 */}
          {request.details && (
            <div className="mb-4">
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                详细信息
              </button>
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="text-xs text-muted-foreground mt-2 pl-4">{request.details}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* 输入框 */}
          {request.requireInput && (
            <div className="mb-4">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={request.inputPlaceholder || '请输入...'}
                className="w-full text-sm bg-muted/50 border border-muted rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                rows={3}
              />
            </div>
          )}

          {/* 不再提示选项 */}
          {request.similarOperationKey && (
            <div className="mb-4 flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border border-muted">
              <button
                onClick={() => setSkipSimilar(!skipSimilar)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  skipSimilar
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/50 hover:border-primary'
                }`}
              >
                {skipSimilar && <Check size={10} className="text-primary-foreground" />}
              </button>
              <div className="flex-1">
                <span className="text-xs text-foreground">不再提示同类操作</span>
                <p className="text-[10px] text-muted-foreground">本次会话内对类似操作自动放行</p>
              </div>
              <BellOff size={14} className="text-muted-foreground shrink-0" />
            </div>
          )}

          {/* 键盘快捷键提示 */}
          <div className="mb-4 flex items-center gap-3 text-[10px] text-muted-foreground/60">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded border border-muted-foreground/20 font-mono">Y</kbd>
              确认
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded border border-muted-foreground/20 font-mono">N</kbd>
              取消
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded border border-muted-foreground/20 font-mono">Tab</kbd>
              切换选项
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded border border-muted-foreground/20 font-mono">Enter</kbd>
              确认
            </span>
          </div>

          {/* 选项按钮 */}
          <div className="flex flex-col gap-2" role="group" aria-label="确认选项">
            {request.options.map((option, index) => {
              const isSelected = selectedOption === option.id;
              const styleClasses: Record<string, string> = {
                default: 'bg-muted hover:bg-muted/80 border border-transparent',
                primary: 'bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent',
                danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-transparent',
                warning: 'bg-[hsl(var(--warning-500))] text-primary-foreground hover:bg-[hsl(var(--warning-600))] border border-transparent',
              };

              const isFirst = index === 0;
              const isLast = index === request.options.length - 1;

              return (
                <motion.button
                  key={option.id}
                  ref={isFirst ? firstOptionRef : isLast ? lastOptionRef : undefined}
                  onClick={() => handleConfirm(option.id)}
                  disabled={isSelected}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                    styleClasses[option.style || 'default']
                  } ${isSelected ? 'ring-2 ring-primary/50' : ''}`}
                  whileHover={{ scale: isSelected ? 1 : 1.01 }}
                  whileTap={{ scale: isSelected ? 1 : 0.99 }}
                >
                  {option.icon && (
                    <span className="shrink-0">{option.icon}</span>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{option.label}</div>
                    {option.description && (
                      <div className="text-xs opacity-70 mt-0.5">{option.description}</div>
                    )}
                  </div>
                  {isSelected ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="shrink-0"
                    >
                      <CheckCircle size={18} />
                    </motion.div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {index + 1}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* 底部 */}
        <div className="border-t p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            {request.allowSkip && (
              <button
                onClick={onDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <RotateCcw size={12} />
                跳过此确认
              </button>
            )}
            {!request.allowSkip && <div />}

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
              <Keyboard size={10} />
              <span>使用键盘快捷键快速操作</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

// 简化版确认对话框
interface SimpleConfirmationProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'default' | 'danger' | 'warning';
}

export const SimpleConfirmation = memo(function SimpleConfirmation({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确认',
  cancelText = '取消',
  type = 'default',
}: SimpleConfirmationProps) {
  const confirmStyle = type === 'danger'
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : type === 'warning'
    ? 'bg-[hsl(var(--warning-500))] text-primary-foreground hover:bg-[hsl(var(--warning-600))]'
    : 'bg-primary text-primary-foreground hover:bg-primary/90';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-sm bg-background rounded-xl shadow-xl overflow-hidden"
        variants={dialogVariants}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 className="text-base font-semibold mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t bg-muted/30">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg hover:bg-muted transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg ${confirmStyle} transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});

// 迷你确认提示
interface MiniConfirmationProps {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const MiniConfirmation = memo(function MiniConfirmation({
  message,
  onConfirm,
  onCancel,
}: MiniConfirmationProps) {
  return (
    <motion.div
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--warning-500))/0.14] border border-[hsl(var(--warning-500))/0.32] text-[hsl(var(--warning-500))] text-xs"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <HelpCircle size={14} />
      <span>{message}</span>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onConfirm}
          className="p-1 hover:bg-[hsl(var(--warning-500))/0.2] rounded"
        >
          <CheckCircle size={12} />
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 hover:bg-[hsl(var(--warning-500))/0.2] rounded"
          >
            <XCircle size={12} />
          </button>
        )}
      </div>
    </motion.div>
  );
});

export default HumanConfirmationDialog;
