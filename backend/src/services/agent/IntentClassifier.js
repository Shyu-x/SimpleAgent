/**
 * IntentClassifier - 意图识别服务
 *
 * 企业级设计：
 * - 区分用户意图才能正确路由请求
 * - 低置信度时不应硬猜，应反问用户澄清
 * - 是Agent智能化的基础能力
 *
 * 支持意图类型：knowledge（知识问答）、tool_use（工具调用）、chat（闲聊）、task（任务执行）
 * 支持多级意图（如 tool_use + web_search）
 */

const EventEmitter = require('events');
const { MiniMaxChatClient } = require('../model');

// 意图类型
const INTENT_TYPES = {
  KNOWLEDGE: 'knowledge',
  TOOL_USE: 'tool_use',
  CHAT: 'chat',
  TASK: 'task'
};

// 置信度阈值
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3
};

// 工具子类型
const TOOL_SUB_TYPES = {
  WEB_SEARCH: 'web_search',
  CALCULATOR: 'calculator',
  FILE_OPERATION: 'file_operation',
  CODE_EXECUTION: 'code_execution',
  TRANSLATION: 'translation',
  IMAGE_GENERATION: 'image_generation',
  WEB_SCRAPER: 'web_scraper',
  DATABASE: 'database'
};

// 任务子类型
const TASK_SUB_TYPES = {
  ANALYSIS: 'analysis',
  SUMMARY: 'summary',
  ORGANIZATION: 'organization',
  PLANNING: 'planning',
  OPTIMIZATION: 'optimization',
  WRITING: 'writing',
  CODING: 'coding'
};

/**
 * 意图分类提示模板
 */
const CLASSIFICATION_PROMPT = `你是一个意图分类助手。请分析用户请求的意图类型。

## 用户请求
{query}

## 上下文
{context}

## 可用工具
{availableTools}

请以JSON格式返回分类结果：
{{
  "intent": "knowledge/tool_use/chat/task",
  "confidence": 0.0-1.0,
  "subIntent": "具体子类型（如 web_search, analysis 等）",
  "reasoning": "简短推理过程（20字以内）",
  "needsClarification": true/false,
  "clarificationQuestion": "如果需要澄清，输出一个简短问题"
}}

只返回JSON，不要其他内容。`;

/**
 * 多级意图关键词模式（用于后备和快速匹配）
 */
const INTENT_KEYWORD_PATTERNS = {
  tool_use: {
    patterns: [
      { subType: TOOL_SUB_TYPES.WEB_SEARCH, keywords: ['搜索', '搜一下', '查找', '查询', 'search', 'find', 'lookup', 'google', '百度'], weight: 1.0 },
      { subType: TOOL_SUB_TYPES.CALCULATOR, keywords: ['计算', '等于', '加', '减', '乘', '除', 'calculate', 'compute', 'plus', 'minus'], weight: 1.0 },
      { subType: TOOL_SUB_TYPES.FILE_OPERATION, keywords: ['读取', '写入', '保存', '打开', '创建文件', 'read', 'write', 'save', 'file'], weight: 1.0 },
      { subType: TOOL_SUB_TYPES.CODE_EXECUTION, keywords: ['运行', '执行', '跑一下', 'run', 'execute', 'start'], weight: 1.0 },
      { subType: TOOL_SUB_TYPES.TRANSLATION, keywords: ['翻译', '译成', '翻译成', 'translate', 'translation'], weight: 1.0 },
      { subType: TOOL_SUB_TYPES.IMAGE_GENERATION, keywords: ['画', '生成图片', '画一个', '帮我画', 'draw', 'generate image', 'create image'], weight: 1.2 },
      { subType: TOOL_SUB_TYPES.WEB_SCRAPER, keywords: ['抓取', '爬取', '获取网页', 'scrape', 'crawl', 'fetch page'], weight: 1.0 }
    ],
    baseWeight: 1.0
  },
  knowledge: {
    patterns: [
      { keywords: ['什么是', '什么意思', '是什么', '介绍', '讲解', '解释', 'what is', 'what are', 'explain', 'define', 'meaning'], weight: 1.0 },
      { keywords: ['如何', '怎么', '教程', '方法', '步骤', 'how to', 'how do', 'tutorial', 'guide', 'steps'], weight: 1.0 },
      { keywords: ['为什么', '原因', '原理', 'why', 'reason', 'principle'], weight: 1.0 },
      { keywords: ['区别', '不同', '比较', '对比', 'difference', 'different', 'compare', 'vs'], weight: 1.0 },
      { keywords: ['机器学习', '深度学习', '神经网络', '算法', '模型', 'transformer', 'attention', 'machine learning', 'deep learning', 'neural network'], weight: 1.5 },
      { keywords: ['Python', 'JavaScript', 'TypeScript', 'Java', '编程', '代码', 'programming', 'code', 'developer'], weight: 1.2 },
      { keywords: ['API', 'HTTP', '数据库', 'SQL', 'database', 'api', 'http'], weight: 1.2 },
      { keywords: ['Docker', '部署', 'Kubernetes', '微服务', 'deploy', 'deployment', 'devops'], weight: 1.2 }
    ],
    baseWeight: 0.9
  },
  task: {
    patterns: [
      { subType: TASK_SUB_TYPES.ANALYSIS, keywords: ['分析', '分析一下', '对比', '评估', 'analyze', 'analysis', 'compare', 'evaluate'], weight: 1.0 },
      { subType: TASK_SUB_TYPES.SUMMARY, keywords: ['总结', '概括', '提炼', '汇总', 'summarize', 'summary', 'outline'], weight: 1.0 },
      { subType: TASK_SUB_TYPES.ORGANIZATION, keywords: ['整理', '整理文档', '归档', '分类', 'organize', 'sort', 'classify'], weight: 1.0 },
      { subType: TASK_SUB_TYPES.PLANNING, keywords: ['制定计划', '安排', '规划', '计划', 'plan', 'schedule', 'arrange'], weight: 1.0 },
      { subType: TASK_SUB_TYPES.OPTIMIZATION, keywords: ['优化', '改进', 'enhance', 'improve', 'optimize', 'refactor'], weight: 1.0 },
      { subType: TASK_SUB_TYPES.WRITING, keywords: ['写文章', '写报告', '写作', '写文案', 'write', 'article', 'essay'], weight: 1.0 },
      { subType: TASK_SUB_TYPES.CODING, keywords: ['写代码', '编程', '开发', 'coding', 'programming', 'developer'], weight: 1.0 }
    ],
    baseWeight: 1.0
  },
  chat: {
    patterns: [
      { keywords: ['你好', '嗨', '早上好', '晚上好', '在吗', 'hello', 'hi', 'hey', 'good morning', 'good night'], weight: 0.5 },
      { keywords: ['吗', '呢', '啊', '哦', '嗯', '？'], weight: 0.2 }
    ],
    baseWeight: 0.4
  }
};

/**
 * 特殊意图模式（高权重前缀匹配）
 */
const SPECIAL_INTENT_PATTERNS = [
  { pattern: /^帮.*搜索/, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.WEB_SEARCH, weight: 20 },
  { pattern: /^search\s+/i, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.WEB_SEARCH, weight: 18 },
  { pattern: /^搜索/, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.WEB_SEARCH, weight: 18 },
  { pattern: /^帮.*画/, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.IMAGE_GENERATION, weight: 20 },
  { pattern: /^画.*图/, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.IMAGE_GENERATION, weight: 18 },
  { pattern: /^计算/, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.CALCULATOR, weight: 18 },
  { pattern: /^翻译/, intent: 'tool_use', subIntent: TOOL_SUB_TYPES.TRANSLATION, weight: 18 },
  { pattern: /^帮.*写/, intent: 'task', subIntent: TASK_SUB_TYPES.WRITING, weight: 15 },
  { pattern: /^帮.*分析/, intent: 'task', subIntent: TASK_SUB_TYPES.ANALYSIS, weight: 15 },
  { pattern: /^帮.*总结/, intent: 'task', subIntent: TASK_SUB_TYPES.SUMMARY, weight: 15 },
  { pattern: /^什么是/, intent: 'knowledge', weight: 12 },
  { pattern: /^如何/, intent: 'knowledge', weight: 12 },
  { pattern: /^为什么/, intent: 'knowledge', weight: 12 },
  { pattern: /^hello|^hi|^嗨/i, intent: 'chat', weight: 10 }
];

class IntentClassifier extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.modelClient - ChatModelClient 实例（可选，默认创建 MiniMaxChatClient）
   * @param {string} options.defaultModel - 默认模型（默认 MiniMax-M2.7-highspeed）
   * @param {number} options.confidenceThreshold - 置信度阈值（默认 0.5）
   * @param {boolean} options.enableLLM - 启用LLM分类（默认 true）
   * @param {boolean} options.enableKeywordFallback - 启用关键词后备（默认 true）
   * @param {Array} options.availableTools - 可用工具列表（用于LLM上下文）
   */
  constructor(options = {}) {
    super();

    // 模型客户端
    if (options.modelClient) {
      this.modelClient = options.modelClient;
    } else {
      this.modelClient = new MiniMaxChatClient({
        apiKey: options.apiKey || process.env.MINIMAX_API_KEY,
        baseUrl: options.baseUrl || process.env.MINIMAX_BASE_URL,
        defaultModel: options.defaultModel || 'MiniMax-M2.7-highspeed'
      });
    }

    this.defaultModel = options.defaultModel || 'MiniMax-M2.7-highspeed';
    this.confidenceThreshold = options.confidenceThreshold || CONFIDENCE_THRESHOLDS.MEDIUM;
    this.enableLLM = options.enableLLM !== false;
    this.enableKeywordFallback = options.enableKeywordFallback !== false;
    this.availableTools = options.availableTools || [];

    // 统计信息
    this.stats = {
      totalClassifications: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      keywordFallbacks: 0,
      clarifications: 0,
      averageLatencyMs: 0
    };
  }

  /**
   * 主分类接口
   * @param {string} query - 用户查询
   * @param {Object} context - 上下文信息 { messages?, tools?, userId? }
   * @returns {Promise<Object>} { intent, confidence, subIntent?, clarification? }
   */
  async classify(query, context = {}) {
    const startTime = Date.now();
    this.stats.totalClassifications++;

    try {
      // 空查询返回闲聊
      if (!query || query.trim() === '') {
        return this._buildResult('chat', 0.4, null, null, 'empty_query');
      }

      const trimmedQuery = query.trim();

      // 1. 优先尝试特殊模式匹配（快速路径）
      const specialMatch = this._matchSpecialPatterns(trimmedQuery);
      if (specialMatch && specialMatch.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
        this._updateLatency(startTime);
        return specialMatch;
      }

      // 2. LLM 分类（如果启用）
      if (this.enableLLM) {
        try {
          const llmResult = await this._classifyWithLLM(trimmedQuery, context);
          if (llmResult.confidence >= this.confidenceThreshold) {
            this.stats.llmSuccesses++;
            this._updateLatency(startTime);

            // 低置信度需要澄清
            if (llmResult.confidence < CONFIDENCE_THRESHOLDS.HIGH && llmResult.confidence < this.confidenceThreshold) {
              return this._addClarification(llmResult, trimmedQuery);
            }

            return llmResult;
          }
        } catch (error) {
          this.stats.llmFailures++;
          console.warn('[IntentClassifier] LLM classification failed, falling back to keywords:', error.message);
        }
      }

      // 3. 关键词匹配后备
      if (this.enableKeywordFallback) {
        this.stats.keywordFallbacks++;
        const keywordResult = this._classifyWithKeywords(trimmedQuery);
        this._updateLatency(startTime);

        if (keywordResult.confidence >= this.confidenceThreshold) {
          if (keywordResult.confidence < CONFIDENCE_THRESHOLDS.HIGH) {
            return this._addClarification(keywordResult, trimmedQuery);
          }
          return keywordResult;
        }
      }

      // 4. 最低置信度返回澄清请求
      const defaultResult = this._buildResult('chat', 0.3, null, null, 'low_confidence');
      this._updateLatency(startTime);
      return this._addClarification(defaultResult, trimmedQuery);

    } catch (error) {
      console.error('[IntentClassifier] Classification error:', error);
      this._updateLatency(startTime);
      return this._buildResult('chat', 0.2, null, '抱歉，我没有理解您的意思，请问您想了解什么？', 'error');
    }
  }

  /**
   * 使用 LLM 进行意图分类
   * @private
   */
  async _classifyWithLLM(query, context = {}) {
    // 构建上下文
    let contextText = '无';
    if (context.messages && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-4);
      contextText = recentMessages
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 100) : '[多模态内容]'}`)
        .join('\n');
    }

    // 构建可用工具描述
    let toolsText = '无特定工具';
    if (this.availableTools.length > 0) {
      toolsText = this.availableTools
        .map(t => `- ${t.name}: ${t.description || '无描述'}`)
        .join('\n');
    } else if (context.tools && context.tools.length > 0) {
      toolsText = context.tools
        .map(t => `- ${t.name}: ${t.description || '无描述'}`)
        .join('\n');
    }

    const prompt = CLASSIFICATION_PROMPT
      .replace('{query}', query)
      .replace('{context}', contextText)
      .replace('{availableTools}', toolsText);

    const response = await this.modelClient.chat({
      messages: [
        { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
        { role: 'user', content: prompt }
      ],
      model: this.defaultModel,
      options: {
        temperature: 0.3,
        max_tokens: 500
      }
    });

    const content = response.content?.[0]?.text || response.content || '';
    const parsed = this._parseJSONResponse(content);

    return this._buildResult(
      parsed.intent || 'chat',
      Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
      parsed.subIntent || null,
      parsed.needsClarification ? parsed.clarificationQuestion : null,
      'llm'
    );
  }

  /**
   * 使用关键词进行意图分类（后备方案）
   * @private
   */
  _classifyWithKeywords(query) {
    const queryLower = query.toLowerCase();
    const scores = {
      tool_use: 0,
      knowledge: 0,
      task: 0,
      chat: 0
    };

    const matchedSubIntents = {
      tool_use: [],
      knowledge: [],
      task: [],
      chat: []
    };

    // 遍历所有意图类型
    for (const [intentType, intentData] of Object.entries(INTENT_KEYWORD_PATTERNS)) {
      let intentScore = 0;

      for (const pattern of intentData.patterns) {
        for (const keyword of pattern.keywords) {
          if (queryLower.includes(keyword.toLowerCase())) {
            const keywordWeight = keyword.length * pattern.weight * intentData.baseWeight;
            intentScore += keywordWeight;

            // 记录子类型匹配
            if (pattern.subType) {
              matchedSubIntents[intentType].push({
                subType: pattern.subType,
                weight: keywordWeight
              });
            }
          }
        }
      }

      scores[intentType] = intentScore;
    }

    // 找出最高分意图
    let bestIntent = 'chat';
    let bestScore = 0;
    for (const [intent, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    // 计算置信度
    const maxPossibleScore = 100; // 归一化基准
    const confidence = bestScore > 0
      ? Math.min(0.3 + (bestScore / maxPossibleScore) * 0.6, 0.95)
      : 0.4;

    // 获取子意图
    let subIntent = null;
    const matchedSubs = matchedSubIntents[bestIntent];
    if (matchedSubs && matchedSubs.length > 0) {
      // 返回权重最高的子意图
      matchedSubs.sort((a, b) => b.weight - a.weight);
      subIntent = matchedSubs[0].subType;
    }

    return this._buildResult(bestIntent, confidence, subIntent, null, 'keyword');
  }

  /**
   * 特殊模式匹配（快速路径）
   * @private
   */
  _matchSpecialPatterns(query) {
    for (const sp of SPECIAL_INTENT_PATTERNS) {
      if (sp.pattern.test(query)) {
        return this._buildResult(
          sp.intent,
          Math.min(sp.weight / 20, 0.95),
          sp.subIntent || null,
          null,
          'special_pattern'
        );
      }
    }
    return null;
  }

  /**
   * 构建分类结果
   * @private
   */
  _buildResult(intent, confidence, subIntent, clarification, source) {
    return {
      intent,
      confidence,
      subIntent: subIntent || undefined,
      clarification: clarification || undefined,
      source,
      timestamp: Date.now()
    };
  }

  /**
   * 低置信度时添加澄清请求
   * @private
   */
  _addClarification(result, query) {
    this.stats.clarifications++;

    // 如果已有澄清问题，直接返回
    if (result.clarification) {
      return result;
    }

    // 生成默认澄清问题
    const clarificationQuestion = this._generateClarificationQuestion(query, result.intent);
    return {
      ...result,
      clarification: clarificationQuestion
    };
  }

  /**
   * 生成澄清问题
   * @private
   */
  _generateClarificationQuestion(query, intent) {
    const templates = {
      knowledge: [
        '您是想了解这个概念的定义，还是想学习相关教程？',
        '请问您想深入了解这个话题的哪个方面？',
        '您是想知道原理还是使用方法？'
      ],
      tool_use: [
        '您需要我帮您执行什么操作？',
        '请问您想使用哪个工具？',
        '您需要我帮您搜索、计算还是做其他事情？'
      ],
      task: [
        '您希望我帮您完成什么任务？',
        '请问这个任务的预期结果是什么？',
        '您需要我分析、整理还是执行其他操作？'
      ],
      chat: [
        '有什么我可以帮您的？',
        '请问您想聊些什么？',
        '您有什么问题想问我吗？'
      ]
    };

    const options = templates[intent] || templates.chat;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * 解析 JSON 响应
   * @private
   */
  _parseJSONResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      // 尝试修复常见 JSON 错误
      const fixed = response
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      try {
        return JSON.parse(fixed);
      } catch {
        throw new Error('Failed to parse JSON response');
      }
    }
  }

  /**
   * 更新延迟统计
   * @private
   */
  _updateLatency(startTime) {
    const latency = Date.now() - startTime;
    const total = this.stats.totalClassifications;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (total - 1) + latency) / total;
  }

  /**
   * 设置可用工具列表
   * @param {Array} tools - 工具列表
   */
  setAvailableTools(tools) {
    this.availableTools = tools || [];
    return this;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalClassifications > 0
        ? ((this.stats.llmSuccesses + this.stats.keywordFallbacks) / this.stats.totalClassifications * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalClassifications: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      keywordFallbacks: 0,
      clarifications: 0,
      averageLatencyMs: 0
    };
    return this;
  }
}

module.exports = {
  IntentClassifier,
  INTENT_TYPES,
  CONFIDENCE_THRESHOLDS,
  TOOL_SUB_TYPES,
  TASK_SUB_TYPES
};
