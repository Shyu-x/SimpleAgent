/**
 * LLM意图理解模块
 * 使用LLM进行语义理解，智能选择工具
 * 支持降级到关键词匹配作为后备方案
 */

const EventEmitter = require('events');

// 意图类型
const INTENT_TYPES = {
  TOOL_USE: 'tool_use',
  CREATIVE: 'creative',
  TASK: 'task',
  KNOWLEDGE: 'knowledge',
  CONVERSATION: 'conversation',
  VISION: 'vision'
};

// 置信度阈值
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3
};

// 工具选择提示模板
const TOOL_SELECTION_PROMPT = `你是一个智能工具选择助手。请分析用户请求，选择最合适的工具。

## 可用工具
{tools}

## 用户请求
{query}

## 上下文
{context}

请以JSON格式返回你的分析结果：
{{
  "intent_type": "工具调用/创意生成/任务执行/知识查询/日常对话/视觉理解",
  "confidence": 0.0-1.0,
  "reasoning": "你的推理过程",
  "selected_tool": "工具名称，如果不需工具则为null",
  "parameters": {{"参数名": "参数值"}},
  "alternative_tools": ["备选工具列表"],
  "needs_more_info": true/false,
  "follow_up_questions": ["如果需要更多信息，列出问题"]
}}

只返回JSON，不要其他内容。`;

// 意图分类提示模板
const INTENT_CLASSIFICATION_PROMPT = `你是一个意图分类助手。请分析用户请求的意图类型。

## 用户请求
{query}

## 历史上下文
{history}

请以JSON格式返回分类结果：
{{
  "intent_type": "tool_use/creative/task/knowledge/conversation",
  "confidence": 0.0-1.0,
  "reasoning": "简短推理",
  "complexity": 1-10,
  "action": {{"action": "动作类型", "target": "目标"}},
  "requires_confirmation": true/false
}}

只返回JSON，不要其他内容。`;

class LLMIntentClassifier extends EventEmitter {
  constructor(options = {}) {
    super();

    this.modelRouter = options.modelRouter || null;
    this.modelId = options.modelId || 'MiniMax-M2.7';
    this.timeout = options.timeout || 10000;
    this.confidenceThreshold = options.confidenceThreshold || CONFIDENCE_THRESHOLDS.MEDIUM;

    // 关键词匹配作为后备
    this.keywordFallback = options.keywordFallback !== false;
    this._initKeywordPatterns();

    // 统计
    this.stats = {
      totalClassifications: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      fallbacks: 0,
      averageLatency: 0
    };
  }

  /**
   * 初始化关键词模式（用于后备）
   */
  _initKeywordPatterns() {
    this.keywordPatterns = {
      tool_use: {
        keywords: ['搜索', '查找', '天气', '计算', '读取', '写入', '执行', '运行', '提醒', '翻译', '查询', 'search', 'find', 'weather', 'calculate', 'read', 'write', 'execute', 'run'],
        weight: 1.0
      },
      creative: {
        keywords: ['写', '创作', '画', '设计', '作曲', '写诗', '写文章', 'write', 'create', 'draw', 'design', 'compose'],
        weight: 1.2
      },
      task: {
        keywords: ['分析', '整理', '总结', '制定', '处理', '转换', '优化', 'analyze', 'organize', 'summarize', 'process', 'convert', 'optimize'],
        weight: 1.1
      },
      knowledge: {
        keywords: ['什么是', '如何', '为什么', '介绍', '解释', '教程', '区别', 'what', 'how', 'why', 'explain', 'tutorial'],
        weight: 0.9
      },
      vision: {
        keywords: ['图片', '图像', '照片', '看图', '图片中', 'image', 'photo', 'picture', 'vision'],
        weight: 1.5
      }
    };
  }

  /**
   * 设置模型路由器
   */
  setModelRouter(router) {
    this.modelRouter = router;
    return this;
  }

  /**
   * 分类用户意图（主入口）
   * @param {string} query - 用户查询
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 分类结果
   */
  async classify(query, context = {}) {
    const startTime = Date.now();
    this.stats.totalClassifications++;

    try {
      // 优先尝试LLM分类
      if (this.modelRouter) {
        const result = await this._classifyWithLLM(query, context);
        const latency = Date.now() - startTime;
        this._updateStats(true, latency);

        // 如果置信度足够，直接返回
        if (result.confidence >= this.confidenceThreshold) {
          return result;
        }

        // 置信度不够，尝试结合关键词
        if (this.keywordFallback) {
          const keywordResult = this._classifyWithKeywords(query);
          if (keywordResult.confidence > result.confidence) {
            this.stats.fallbacks++;
            return keywordResult;
          }
        }

        return result;
      }

      // 没有LLM，使用关键词
      this.stats.fallbacks++;
      return this._classifyWithKeywords(query);

    } catch (error) {
      const latency = Date.now() - startTime;
      this._updateStats(false, latency);

      // LLM失败，降级到关键词
      if (this.keywordFallback) {
        this.stats.fallbacks++;
        return this._classifyWithKeywords(query);
      }

      // 返回默认结果
      return this._defaultClassification();
    }
  }

  /**
   * 使用LLM进行意图分类
   */
  async _classifyWithLLM(query, context = {}) {
    // 构建历史上下文
    let historyText = '';
    if (context.messages && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-4);
      historyText = recentMessages.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');
    }

    // 构建提示
    const prompt = INTENT_CLASSIFICATION_PROMPT
      .replace('{query}', query)
      .replace('{history}', historyText || '无');

    // 调用LLM
    const response = await this._callLLM(prompt);

    // 解析JSON响应
    const parsed = this._parseJSONResponse(response);

    return {
      intent: {
        type: this._mapIntentType(parsed.intent_type),
        name: this._getIntentName(parsed.intent_type)
      },
      confidence: parsed.confidence || 0.5,
      complexity: parsed.complexity || 5,
      requiresConfirmation: parsed.requires_confirmation || false,
      action: parsed.action || { action: 'conversation', target: 'llm_direct' },
      reasoning: parsed.reasoning || '',
      source: 'llm'
    };
  }

  /**
   * 智能选择工具
   * @param {string} query - 用户查询
   * @param {Array} availableTools - 可用工具列表
   * @param {Object} context - 上下文
   * @returns {Promise<Object>} 工具选择结果
   */
  async selectTool(query, availableTools, context = {}) {
    const startTime = Date.now();

    try {
      // 构建工具描述
      const toolsDescription = availableTools.map(t =>
        `- ${t.name}: ${t.description || '无描述'} (参数: ${Object.keys(t.parameters || {}).join(', ') || '无'})`
      ).join('\n');

      // 构建提示
      const prompt = TOOL_SELECTION_PROMPT
        .replace('{tools}', toolsDescription)
        .replace('{query}', query)
        .replace('{context}', JSON.stringify(context));

      // 调用LLM
      const response = await this._callLLM(prompt);

      // 解析响应
      const parsed = this._parseJSONResponse(response);

      return {
        selectedTool: parsed.selected_tool || null,
        parameters: parsed.parameters || {},
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || '',
        alternativeTools: parsed.alternative_tools || [],
        needsMoreInfo: parsed.needs_more_info || false,
        followUpQuestions: parsed.follow_up_questions || [],
        source: 'llm'
      };

    } catch (error) {
      // 降级到关键词匹配
      return this._selectToolWithKeywords(query, availableTools);
    }
  }

  /**
   * 使用关键词选择工具
   */
  _selectToolWithKeywords(query, availableTools) {
    const queryLower = query.toLowerCase();
    const toolScores = {};

    // 评分每个工具
    for (const tool of availableTools) {
      const toolName = tool.name.toLowerCase();
      let score = 0;

      // 名称匹配
      if (queryLower.includes(toolName)) {
        score += 0.5;
      }

      // 关键词匹配
      if (tool.keywords) {
        for (const kw of tool.keywords) {
          if (queryLower.includes(kw.toLowerCase())) {
            score += 0.3;
          }
        }
      }

      // 描述匹配
      if (tool.description) {
        const descLower = tool.description.toLowerCase();
        if (queryLower.includes('搜索') && descLower.includes('search')) score += 0.3;
        if (queryLower.includes('计算') && descLower.includes('calculat')) score += 0.3;
        if (queryLower.includes('文件') && descLower.includes('file')) score += 0.3;
      }

      if (score > 0) {
        toolScores[tool.name] = score;
      }
    }

    // 选择得分最高的工具
    const sorted = Object.entries(toolScores).sort((a, b) => b[1] - a[1]);

    return {
      selectedTool: sorted.length > 0 ? sorted[0][0] : null,
      parameters: {},
      confidence: sorted.length > 0 ? Math.min(sorted[0][1], 1) : 0,
      reasoning: '基于关键词匹配',
      alternativeTools: sorted.slice(1).map(([name]) => name),
      needsMoreInfo: sorted.length === 0,
      source: 'keyword'
    };
  }

  /**
   * 使用关键词进行意图分类（后备方案）
   */
  _classifyWithKeywords(query) {
    this.stats.totalClassifications++;
    this.stats.keywordClassifications++;

    const queryLower = query.toLowerCase();
    const scores = {};

    for (const [intentType, pattern] of Object.entries(this.keywordPatterns)) {
      let score = 0;
      for (const keyword of pattern.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          score += pattern.weight;
        }
      }
      scores[intentType] = score;
    }

    // 找出最高分
    let bestType = 'conversation';
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // 计算置信度
    const maxPossibleScore = Object.values(this.keywordPatterns).reduce((max, p) => max + p.weight, 0);
    const confidence = bestScore > 0 ? Math.min(bestScore / maxPossibleScore * 2, 0.9) : 0.4;

    return {
      intent: {
        type: bestType,
        name: this._getIntentName(bestType)
      },
      confidence,
      complexity: 3,
      requiresConfirmation: confidence < CONFIDENCE_THRESHOLDS.MEDIUM,
      action: this._determineAction(bestType),
      reasoning: `关键词匹配: ${query.substring(0, 50)}`,
      source: 'keyword'
    };
  }

  /**
   * 调用LLM
   */
  async _callLLM(prompt) {
    if (!this.modelRouter) {
      throw new Error('No model router available');
    }

    const messages = [
      { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
      { role: 'user', content: prompt }
    ];

    const result = await this.modelRouter.callAPI(this.modelId, {
      messages,
      temperature: 0.3,
      max_tokens: 1000
    });

    // 提取响应内容
    if (result.choices && result.choices[0]) {
      return result.choices[0].message.content;
    }

    if (result.content) {
      return result.content;
    }

    throw new Error('Invalid LLM response');
  }

  /**
   * 解析JSON响应
   */
  _parseJSONResponse(response) {
    try {
      // 尝试提取JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      // 尝试修复常见问题
      const fixed = response
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      try {
        return JSON.parse(fixed);
      } catch {
        throw new Error('Failed to parse JSON response');
      }
    }
  }

  /**
   * 映射意图类型
   */
  _mapIntentType(type) {
    const mapping = {
      'tool_use': 'tool_use',
      'creative': 'creative',
      'task': 'task',
      'knowledge': 'knowledge',
      'conversation': 'conversation',
      '工具调用': 'tool_use',
      '创意生成': 'creative',
      '任务执行': 'task',
      '知识查询': 'knowledge',
      '日常对话': 'conversation'
    };
    return mapping[type] || 'conversation';
  }

  /**
   * 获取意图名称
   */
  _getIntentName(type) {
    const names = {
      tool_use: '工具调用',
      creative: '创意生成',
      task: '任务执行',
      knowledge: '知识查询',
      conversation: '日常对话',
      vision: '视觉理解'
    };
    return names[type] || '日常对话';
  }

  /**
   * 确定动作
   */
  _determineAction(type) {
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

  /**
   * 默认分类
   */
  _defaultClassification() {
    return {
      intent: { type: 'conversation', name: '日常对话' },
      confidence: 0.4,
      complexity: 2,
      requiresConfirmation: false,
      action: { action: 'conversation', target: 'llm_direct' },
      reasoning: '默认分类',
      source: 'default'
    };
  }

  /**
   * 更新统计
   */
  _updateStats(success, latency) {
    if (success) {
      this.stats.llmSuccesses++;
    } else {
      this.stats.llmFailures++;
    }

    // 更新平均延迟
    const total = this.stats.llmSuccesses + this.stats.llmFailures;
    this.stats.averageLatency =
      (this.stats.averageLatency * (total - 1) + latency) / total;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalClassifications: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      fallbacks: 0,
      averageLatency: 0
    };
  }
}

module.exports = {
  LLMIntentClassifier,
  INTENT_TYPES,
  CONFIDENCE_THRESHOLDS
};
