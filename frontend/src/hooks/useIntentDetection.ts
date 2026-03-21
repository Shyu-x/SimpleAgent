import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

// 意图类型
export type IntentType =
  | 'tool_use'    // 工具使用意图
  | 'creative'     // 创意生成意图
  | 'task'         // 任务执行意图
  | 'knowledge'    // 知识问答意图
  | 'conversation' // 普通对话意图
  | 'vision'       // 视觉/图片意图
  | 'image_generation'; // 图像生成意图（显式请求生成图片）

// 关键词模式配置
const KEYWORD_PATTERNS: Record<IntentType, { keywords: string[]; weight: number }> = {
  tool_use: {
    keywords: ['搜索', '查找', '计算', '执行', '获取', '查询', '下载', '上传', '发送', '调用'],
    weight: 1.0,
  },
  creative: {
    keywords: ['写', '创作', '画', '设计', '生成', '编写', '作曲', '作诗', '写代码', '生成图片'],
    weight: 1.2,
  },
  task: {
    keywords: ['分析', '整理', '总结', '制定', '计划', '安排', '分类', '比较', '评估', '优化'],
    weight: 1.1,
  },
  knowledge: {
    keywords: ['什么是', '如何', '为什么', '教程', '解释', '定义', '原理', '概念', '方法', '步骤'],
    weight: 0.9,
  },
  vision: {
    keywords: ['图片', '图像', '看图', '识别', '分析图片', '描述图片', '图片内容', '截图'],
    weight: 1.5,
  },
  conversation: {
    keywords: ['聊', '说', '问', '告诉', '关于', '聊聊', '随便'],
    weight: 0.5,
  },
  image_generation: {
    // 显式生图请求 - 权重最高
    keywords: ['画', '生成图片', '生成图', '帮我画', '画个', '生成一幅', '生成一张图', '生成图像', '做张图', '搞张图', '变成图'],
    weight: 2.0,
  },
};

// 意图检测结果
export interface IntentResult {
  type: IntentType;
  confidence: number;
  reasoning: string;
  requiresAgent: boolean;
  matchedKeywords: string[];
  alternativeTypes: Array<{ type: IntentType; confidence: number }>;
}

// 内部评分结果
interface ScoringResult {
  type: IntentType;
  score: number;
  matchedKeywords: string[];
}

// 文本预处理
function preprocessText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 关键词匹配评分
function scoreKeywords(text: string): ScoringResult[] {
  const preprocessed = preprocessText(text);
  const results: ScoringResult[] = [];

  for (const [type, config] of Object.entries(KEYWORD_PATTERNS)) {
    const matchedKeywords: string[] = [];
    let score = 0;

    for (const keyword of config.keywords) {
      if (preprocessed.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        score += config.weight;
      }
    }

    // 归一化分数（根据匹配关键词数量和权重）
    const normalizedScore = matchedKeywords.length > 0
      ? (score * matchedKeywords.length) / config.keywords.length
      : 0;

    results.push({
      type: type as IntentType,
      score: normalizedScore,
      matchedKeywords,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// 判断是否需要 Agent
function determineRequiresAgent(type: IntentType, confidence: number): boolean {
  // 高置信度的特定意图类型需要 Agent
  if (confidence >= 0.8) {
    return ['tool_use', 'task', 'vision', 'image_generation'].includes(type);
  }
  if (confidence >= 0.6) {
    return ['creative', 'task', 'image_generation'].includes(type);
  }
  return false;
}

// 生成推理说明
function generateReasoning(type: IntentType, matchedKeywords: string[], confidence: number): string {
  if (matchedKeywords.length === 0) {
    return '未检测到明确意图模式，可能是普通对话';
  }

  const keywordList = matchedKeywords.slice(0, 3).join('、');
  const descriptions: Record<IntentType, string> = {
    tool_use: `检测到工具相关关键词（${keywordList}），可能需要执行操作`,
    creative: `检测到创作相关关键词（${keywordList}），可能需要生成内容`,
    task: `检测到任务相关关键词（${keywordList}），可能需要多步骤处理`,
    knowledge: `检测到知识相关关键词（${keywordList}），可能是问答场景`,
    vision: `检测到视觉相关关键词（${keywordList}），可能涉及图片处理`,
    conversation: `检测到对话相关关键词（${keywordList}），可能是闲聊`,
    image_generation: `检测到显式图像生成关键词（${keywordList}），将调用 MiniMax API 生成图片`,
  };

  return descriptions[type];
}

/**
 * 检测意图 (同步版本，可直接调用)
 */
export function detectIntent(text: string): IntentResult | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const scores = scoreKeywords(text);

  if (scores.length === 0 || scores[0].score === 0) {
    return {
      type: 'conversation',
      confidence: 0.5,
      reasoning: '未检测到明确意图，使用默认对话模式',
      requiresAgent: false,
      matchedKeywords: [],
      alternativeTypes: [],
    };
  }

  const top = scores[0];
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const confidence = totalScore > 0 ? Math.min(top.score / totalScore, 1) : 0;

  // 获取备选类型
  const alternativeTypes = scores
    .slice(1, 3)
    .filter(s => s.score > 0)
    .map(s => ({ type: s.type, confidence: s.score / totalScore }));

  return {
    type: top.type,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: generateReasoning(top.type, top.matchedKeywords, confidence),
    requiresAgent: determineRequiresAgent(top.type, confidence),
    matchedKeywords: top.matchedKeywords,
    alternativeTypes,
  };
}

// Hook 配置
interface UseIntentDetectionOptions {
  debounceMs?: number;
  threshold?: number;
  enabled?: boolean;
}

// Hook 返回类型
interface UseIntentDetectionReturn {
  intent: IntentResult | null;
  isAnalyzing: boolean;
  detect: (text: string) => void;
  clear: () => void;
}

/**
 * 意图检测 Hook
 * 使用关键词匹配算法分析用户输入的意图类型
 *
 * @param options.debounceMs - 防抖延迟（默认 300ms）
 * @param options.threshold - 置信度阈值（默认 0.3）
 * @param options.enabled - 是否启用（默认 true）
 */
export function useIntentDetection(options: UseIntentDetectionOptions = {}): UseIntentDetectionReturn {
  const {
    debounceMs = 300,
    threshold = 0.3,
    enabled = true,
  } = options;

  const [intent, setIntent] = useState<IntentResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef<string>('');

  // 清除定时器
  const clearTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // 检测意图
  const detect = useCallback((text: string) => {
    if (!enabled) return;

    // 避免重复检测相同文本
    if (text === lastTextRef.current) return;
    lastTextRef.current = text;

    clearTimer();

    // 文本过短，跳过
    if (text.trim().length < 2) {
      setIntent(null);
      setIsAnalyzing(false);
      return;
    }

    setIsAnalyzing(true);

    debounceTimerRef.current = setTimeout(() => {
      const result = detectIntent(text); // 使用导出的函数

      // 应用阈值过滤
      if (result && result.confidence < threshold) {
        setIntent({
          ...result,
          type: 'conversation',
          confidence: result.confidence,
          reasoning: '置信度低于阈值，使用默认对话模式',
        });
      } else {
        setIntent(result);
      }

      setIsAnalyzing(false);
    }, debounceMs);
  }, [enabled, debounceMs, threshold, clearTimer]);

  // 清除结果
  const clear = useCallback(() => {
    clearTimer();
    setIntent(null);
    setIsAnalyzing(false);
    lastTextRef.current = '';
  }, [clearTimer]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return useMemo(() => ({
    intent,
    isAnalyzing,
    detect,
    clear,
  }), [intent, isAnalyzing, detect, clear]);
}

export default useIntentDetection;
