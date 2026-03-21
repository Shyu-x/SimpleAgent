/**
 * 意图识别器 - 智能化升级版本 V4
 * 支持LLM语义理解 + 关键词匹配后备
 * 中英文关键词 + 技术术语
 */

const EventEmitter = require('events');
const { LLMIntentClassifier } = require('../llmIntentClassifier');

// 意图类型定义
const INTENT_TYPES = {
  KNOWLEDGE: 'knowledge',
  TOOL_USE: 'tool_use',
  CREATIVE: 'creative',
  TASK: 'task',
  CONVERSATION: 'conversation'
};

// 扩展的意图关键词模式 - 全面覆盖中英文和技术术语
const INTENT_PATTERNS = [
  // === TOOL_USE (优先级1) ===
  {
    type: 'tool_use',
    patterns: [
      { keywords: ['搜索', '搜一下', '搜素', '查找', '找一下', 'search', 'find', 'lookup', 'google'], weight: 10, category: 'search' },
      { keywords: ['天气', '气温', '温度', '气候', '下雨', '晴天', 'weather', 'temperature', 'forecast'], weight: 10, category: 'weather' },
      { keywords: ['计算', '等于', '加', '减', '乘', '除', '算', '多少', 'calculate', 'compute', 'plus', 'minus', 'times', 'compute'], weight: 10, category: 'calculator' },
      { keywords: ['读取', '写入', '保存', '打开', '创建文件', 'read', 'write', 'save', 'file', 'open'], weight: 10, category: 'file' },
      { keywords: ['提醒', '闹钟', '定时', '日程', 'remind', 'alarm', 'schedule', 'reminder'], weight: 8, category: 'reminder' },
      { keywords: ['播放', '播放音乐', '听歌', '放歌', 'play', 'music', 'song'], weight: 8, category: 'media' },
      { keywords: ['翻译', '译成', '翻译成', 'translate', 'translation'], weight: 9, category: 'translate' },
      { keywords: ['查询', '查一下', '查询', 'query', 'check'], weight: 9, category: 'query' }
    ]
  },
  // === CREATIVE (优先级2) ===
  {
    type: 'creative',
    patterns: [
      { keywords: ['写一首', '创作', '写一个故事', '写小说', '写诗', '写文章', '写作', '写文案', '写报告', '写脚本', '写小说', 'write', 'create', 'compose', 'poem', 'story', 'article', 'essay', 'novel'], weight: 12, category: 'writing' },
      { keywords: ['画', '画画', '绘制', '设计', '设计一个', '设计logo', 'draw', 'design', 'art', 'painting'], weight: 11, category: 'art' },
      { keywords: ['创作歌曲', '写歌词', '作曲', '编曲', 'song', 'lyrics', 'music', 'compose'], weight: 10, category: 'music' },
      { keywords: ['营销方案', '广告文案', '宣传语', '口号', '策划', 'marketing', 'ad', 'slogan', 'campaign'], weight: 10, category: 'marketing' },
      { keywords: ['润色', '修改', '优化', '改写', 'polish', 'edit', 'improve', 'revise'], weight: 8, category: 'editing' }
    ]
  },
  // === TASK (优先级3) ===
  {
    type: 'task',
    patterns: [
      { keywords: ['分析', '分析一下', '分析数据', '对比', '评估', 'analyze', 'analysis', 'compare', 'evaluate', 'review'], weight: 10, category: 'analysis' },
      { keywords: ['整理', '整理文档', '整理资料', '归档', '分类', 'organize', 'sort', 'classify', 'organize'], weight: 10, category: 'organize' },
      { keywords: ['总结', '概括', '提炼', '汇总', 'summarize', 'summary', 'outline', 'extract'], weight: 10, category: 'summary' },
      { keywords: ['制定计划', '安排', '规划', '计划', 'plan', 'schedule', 'arrange', 'organize'], weight: 9, category: 'planning' },
      { keywords: ['处理', '转换', '格式化', '提取', 'process', 'convert', 'format', 'extract', 'transform'], weight: 9, category: 'processing' },
      { keywords: ['优化', '改进', 'enhance', 'improve', 'optimize', 'refactor'], weight: 8, category: 'optimization' }
    ]
  },
  // === KNOWLEDGE (优先级4) - 扩展覆盖 ===
  {
    type: 'knowledge',
    patterns: [
      // 基础疑问词
      { keywords: ['什么是', '什么意思', '是什么', '什么', '什么是', 'what is', 'what are', 'explain', 'define', 'definition', 'meaning', 'what does'], weight: 12, category: 'concept' },
      // 学习/教程
      { keywords: ['教程', '学习', '如何', '怎么', '方法', '步骤', '入门', 'tutorial', 'how to', 'learn', 'guide', 'steps', 'beginner', 'getting started'], weight: 11, category: 'tutorial' },
      // 解释/说明
      { keywords: ['介绍', '说明', '讲解', '讲讲', '介绍', 'introduce', 'describe', 'tell me about', 'explain'], weight: 10, category: 'introduction' },
      // 区别/比较
      { keywords: ['区别', '不同', '比较', '对比', 'difference', 'different', 'compare', 'vs', 'versus'], weight: 10, category: 'comparison' },
      // 原理/原因
      { keywords: ['原理', '原因', '为什么', 'reason', 'why', 'principle', 'how'], weight: 10, category: 'reasoning' },
      // 技术术语 - 机器学习
      { keywords: ['机器学习', '深度学习', '神经网络', '算法', '模型', '训练', '预测', 'machine learning', 'deep learning', 'neural network', 'algorithm', 'model', 'training', 'prediction', 'ML', 'DL', 'AI'], weight: 15, category: 'ml' },
      // Transformer/注意力
      { keywords: ['Transformer', '注意力', 'attention', 'BERT', 'GPT', '架构', 'architecture'], weight: 15, category: 'transformer' },
      // 优化相关
      { keywords: ['优化', '正则化', '归一化', '梯度', 'loss', 'optimizer', 'gradient', 'normalization', 'regularization'], weight: 12, category: 'optimization' },
      // 部署/工程
      { keywords: ['部署', 'Docker', 'Kubernetes', '微服务', 'API', '部署', 'deploy', 'deployment', 'devops'], weight: 10, category: 'deployment' },
      // 编程语言
      { keywords: ['Python', 'JavaScript', 'Java', 'TypeScript', '编程', '代码', '程序', '开发', 'programming', 'code', 'developer'], weight: 12, category: 'programming' },
      // 数据库
      { keywords: ['数据库', 'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'database', 'db'], weight: 10, category: 'database' },
      // 网络/协议
      { keywords: ['HTTP', 'TCP', 'API', 'REST', 'GraphQL', '协议', 'network', 'protocol'], weight: 10, category: 'network' }
    ]
  },
  // === CONVERSATION (优先级5 - 最低) ===
  {
    type: 'conversation',
    patterns: [
      { keywords: ['你好', '嗨', '早上好', '晚好', '在吗', '好', 'hello', 'hi', 'hey', 'good morning', 'hey there'], weight: 5, category: 'greeting' },
      { keywords: ['吗', '呢', '啊', '哦', '嗯', '?'], weight: 2, category: 'question' },
      { keywords: ['今天', '昨天', '明天', '现在', '今天天气'], weight: 3, category: 'time' }
    ]
  }
];

// 特殊模式
const SPECIAL_PATTERNS = [
  { pattern: /^帮.*写/, type: 'creative', weight: 20 },
  { pattern: /^help.*write/i, type: 'creative', weight: 20 },
  { pattern: /^帮.*做/, type: 'task', weight: 15 },
  { pattern: /^help.*do/i, type: 'task', weight: 15 },
  { pattern: /^搜索/, type: 'tool_use', weight: 18 },
  { pattern: /^search\s+/i, type: 'tool_use', weight: 18 },
  { pattern: /^计算/, type: 'tool_use', weight: 18 },
  { pattern: /^calculate\s+/i, type: 'tool_use', weight: 18 },
  { pattern: /^翻译/, type: 'tool_use', weight: 18 },
  { pattern: /^translate\s+/i, type: 'tool_use', weight: 18 }
];

const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3
};

class TaskClassifier extends EventEmitter {
  constructor(options = {}) {
    super();
    this.minConfidence = options.minConfidence || CONFIDENCE_THRESHOLDS.MEDIUM;

    // LLM意图分类器（可选）
    this.llmEnabled = options.llmEnabled !== false;
    this.llmClassifier = null;

    // 如果提供了modelRouter，创建LLM分类器
    if (options.modelRouter && this.llmEnabled) {
      this.llmClassifier = new LLMIntentClassifier({
        modelRouter: options.modelRouter,
        modelId: options.llmModelId || 'gpt-4o-mini',
        confidenceThreshold: this.minConfidence
      });
    }

    // 统计
    this.stats = {
      totalClassifications: 0,
      llmClassifications: 0,
      keywordClassifications: 0,
      averageLatency: 0
    };
  }

  classify(context) {
    const startTime = Date.now();
    this.stats.totalClassifications++;

    try {
      const { messages, query: queryFromContext } = context;

      // 检测图像 - 先检测，因为即使没有文字，图像内容也应该识别
      if (this.hasImageContent(messages)) {
        return {
          intent: { type: 'vision', name: '视觉理解' },
          confidence: 0.95,
          complexity: 7,
          requiresConfirmation: false,
          action: { action: 'vision', target: 'multimodal' },
          source: 'vision_detection'
        };
      }

      const query = queryFromContext || this.extractLastUserMessage(messages);
      if (!query || query.trim() === '') {
        return this.defaultClassification();
      }

      const text = query.trim();

      // 优先尝试LLM分类（如果可用）
      if (this.llmClassifier) {
        return this._classifyWithLLM(text, context, startTime);
      }

      // 使用关键词分类
      return this._classifyWithKeywords(text, startTime);

    } catch (error) {
      console.error('TaskClassifier.classify error:', error.message);
      return this.defaultClassification();
    }
  }

  /**
   * 使用LLM进行意图分类
   */
  async _classifyWithLLM(text, context, startTime) {
    try {
      const result = await this.llmClassifier.classify(text, context);

      // 更新统计
      this.stats.llmClassifications++;
      this._updateLatencyStats(startTime);

      // 如果置信度足够，返回结果
      if (result.confidence >= this.minConfidence) {
        return result;
      }

      // 置信度不够，结合关键词
      const keywordResult = this._keywordClassify(text);
      if (keywordResult.confidence > result.confidence) {
        this.stats.keywordClassifications++;
        return keywordResult;
      }

      return result;

    } catch (error) {
      console.warn('LLM classification failed, falling back to keywords:', error.message);
      this.stats.keywordClassifications++;
      return this._classifyWithKeywords(text, startTime);
    }
  }

  /**
   * 使用关键词分类（主逻辑）
   */
  _classifyWithKeywords(text, startTime) {
    this.stats.keywordClassifications++;
    this._updateLatencyStats(startTime);

    // 特殊模式匹配
    const specialMatch = this.matchSpecialPatterns(text);
    if (specialMatch) {
      return this.buildResult(specialMatch.type, specialMatch.weight);
    }

    // 关键词权重匹配
    const keywordMatch = this.matchKeywords(text);
    if (keywordMatch) {
      return this.buildResult(keywordMatch.type, keywordMatch.weight);
    }

    // 无匹配时，根据上下文猜测最可能意图
    // 学术/技术术语默认归为知识
    if (this.isTechnicalTerm(text)) {
      return {
        intent: { type: 'knowledge', name: '知识查询' },
        confidence: 0.6,
        complexity: 5,
        requiresConfirmation: false,
        action: { action: 'knowledge_retrieval', target: 'vector_db' },
        source: 'keyword'
      };
    }

    return this.defaultClassification();
  }

  /**
   * 快速关键词分类（不更新统计）
   */
  _keywordClassify(text) {
    const specialMatch = this.matchSpecialPatterns(text);
    if (specialMatch) {
      return this.buildResult(specialMatch.type, specialMatch.weight);
    }

    const keywordMatch = this.matchKeywords(text);
    if (keywordMatch) {
      return this.buildResult(keywordMatch.type, keywordMatch.weight);
    }

    if (this.isTechnicalTerm(text)) {
      return {
        intent: { type: 'knowledge', name: '知识查询' },
        confidence: 0.6,
        complexity: 5,
        requiresConfirmation: false,
        action: { action: 'knowledge_retrieval', target: 'vector_db' },
        source: 'keyword'
      };
    }

    return this.defaultClassification();
  }

  /**
   * 更新延迟统计
   */
  _updateLatencyStats(startTime) {
    const latency = Date.now() - startTime;
    const total = this.stats.totalClassifications;
    this.stats.averageLatency =
      (this.stats.averageLatency * (total - 1) + latency) / total;
  }

  matchSpecialPatterns(text) {
    for (const sp of SPECIAL_PATTERNS) {
      if (sp.pattern.test(text)) {
        return { type: sp.type, weight: sp.weight };
      }
    }
    return null;
  }

  matchKeywords(text) {
    const scores = { tool_use: 0, creative: 0, task: 0, knowledge: 0, conversation: 0 };
    const textLower = text.toLowerCase();

    for (const intentGroup of INTENT_PATTERNS) {
      for (const pattern of intentGroup.patterns) {
        for (const keyword of pattern.keywords) {
          if (textLower.includes(keyword.toLowerCase())) {
            const kw = keyword.length * pattern.weight;
            scores[intentGroup.type] += kw;
          }
        }
      }
    }

    let bestType = 'conversation';
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    if (bestScore === 0) return null;
    return { type: bestType, weight: bestScore };
  }

  // 检测是否是技术术语
  isTechnicalTerm(text) {
    const technicalTerms = [
      '学习', '神经网络', '算法', '模型', '训练', '预测',
      'transformer', 'attention', 'bert', 'gpt', 'embedding',
      'python', 'javascript', 'java', 'typescript', 'code',
      'api', 'http', 'database', 'sql', 'docker', 'kubernetes',
      'machine learning', 'deep learning', 'ai', 'ml', 'dl'
    ];
    const textLower = text.toLowerCase();
    return technicalTerms.some(term => textLower.includes(term.toLowerCase()));
  }

  buildResult(type, weight) {
    const confidence = Math.min(0.5 + (weight / 50), 0.95);
    return {
      intent: { type, name: this.getIntentName(type) },
      confidence,
      complexity: 2,
      requiresConfirmation: confidence < CONFIDENCE_THRESHOLDS.MEDIUM,
      action: this.determineAction(type),
      source: 'keyword'
    };
  }

  getIntentName(type) {
    const names = { tool_use: '工具调用', creative: '创意生成', task: '任务执行', knowledge: '知识查询', conversation: '日常对话', vision: '视觉理解' };
    return names[type] || '日常对话';
  }

  determineAction(type) {
    const actions = {
      tool_use: { action: 'tool_call', target: 'external_tool' },
      creative: { action: 'content_generation', target: 'llm_direct' },
      task: { action: 'task_execution', target: 'agent' },
      knowledge: { action: 'knowledge_retrieval', target: 'vector_db' },
      conversation: { action: 'conversation', target: 'llm_direct' },
      vision: { action: 'vision', target: 'multimodal' }
    };
    return actions[type] || actions.conversation;
  }

  extractLastUserMessage(messages) {
    if (!messages || !Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
          const textContent = msg.content.find(c => c.type === 'text');
          return textContent?.text || '';
        }
      }
    }
    return '';
  }

  hasImageContent(messages) {
    if (!messages) return false;
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const content of msg.content) {
          if (content.type === 'image' || content.type === 'image_url') return true;
        }
      }
    }
    return false;
  }

  defaultClassification() {
    return {
      intent: { type: 'conversation', name: '日常对话' },
      confidence: 0.4,
      complexity: 2,
      requiresConfirmation: false,
      action: { action: 'conversation', target: 'llm_direct' },
      source: 'default'
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 设置模型路由器
   */
  setModelRouter(router) {
    if (router && this.llmEnabled) {
      this.llmClassifier = new LLMIntentClassifier({
        modelRouter: router,
        modelId: 'gpt-4o-mini',
        confidenceThreshold: this.minConfidence
      });
    }
    return this;
  }
}

module.exports = { TaskClassifier, INTENT_TYPES, CONFIDENCE_THRESHOLDS };
