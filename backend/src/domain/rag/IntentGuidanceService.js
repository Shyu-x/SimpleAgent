/**
 * IntentGuidanceService - 意图澄清引导服务
 *
 * 功能说明：
 * - 当意图识别置信度不足时，主动生成引导问题
 * - 提供多层级澄清策略（领域级、类目级、话题级）
 * - 生成简洁明确的选项供用户选择
 *
 * 企业级设计要点：
 * - 策略模式：根据不同意图类型选择对应引导策略
 * - 可扩展：支持添加新的引导策略
 * - 上下文感知：根据历史对话上下文生成更精准的引导
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const { INTENT_TYPES, TOOL_SUB_TYPES, TASK_SUB_TYPES } = require('./IntentClassifier');

// ==================== 引导层级定义 ====================

/**
 * 引导层级枚举
 */
const GUIDANCE_LEVELS = {
  DOMAIN: 'domain',       // 领域级澄清：技术问题 vs 帮助请求 vs 其他
  CATEGORY: 'category',   // 类目级澄清：编程 vs 工具使用 vs 配置
  TOPIC: 'topic'          // 话题级澄清：具体想了解哪方面
};

/**
 * 置信度阈值配置
 */
const GUIDANCE_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.8,   // 高置信度，无需澄清
  MEDIUM_CONFIDENCE: 0.5, // 中等置信度，可选澄清
  LOW_CONFIDENCE: 0.3     // 低置信度，必须澄清
};

// ==================== 引导模板定义 ====================

/**
 * 领域级引导模板
 */
const DOMAIN_GUIDANCE = {
  // 意图类型对应的领域引导问题
  [INTENT_TYPES.KNOWLEDGE_QA]: {
    question: '您是想了解某个概念、原理，还是想学习具体教程？',
    options: [
      { label: '概念解释', value: 'concept', description: '了解某个术语或概念的定义' },
      { label: '原理说明', value: 'principle', description: '了解某个技术的内部原理' },
      { label: '学习教程', value: 'tutorial', description: '获取某个主题的学习指导' },
      { label: '对比分析', value: 'comparison', description: '比较不同技术或方案的优劣' }
    ]
  },
  [INTENT_TYPES.TOOL_USE]: {
    question: '您需要我帮您执行什么操作？',
    options: [
      { label: '搜索信息', value: 'search', description: '搜索网页、文档或数据库内容' },
      { label: '执行计算', value: 'calculator', description: '进行数学计算或数据处理' },
      { label: '翻译内容', value: 'translation', description: '翻译文本内容' },
      { label: '生成图片', value: 'image_generation', description: '根据描述生成图像' }
    ]
  },
  [INTENT_TYPES.TASK_EXECUTION]: {
    question: '您希望我帮您完成什么类型的任务？',
    options: [
      { label: '分析任务', value: 'analysis', description: '分析数据、代码或文档' },
      { label: '总结任务', value: 'summary', description: '总结文档、文章或会议内容' },
      { label: '写作任务', value: 'writing', description: '撰写文章、报告或文案' },
      { label: '编程任务', value: 'coding', description: '编写、调试或优化代码' }
    ]
  },
  [INTENT_TYPES.CASUAL_CHAT]: {
    question: '有什么我可以帮您的？',
    options: [
      { label: '闲聊', value: 'chat', description: '随便聊聊天' },
      { label: '获取帮助', value: 'help', description: '了解系统功能和使用方法' },
      { label: '其他问题', value: 'other', description: '其他我需要帮助的事情' }
    ]
  },
  [INTENT_TYPES.COMPLEX]: {
    question: '您的请求包含多个部分，请问您最想先解决哪个？',
    options: [
      { label: '先处理第一个', value: 'first', description: '专注于请求的第一部分' },
      { label: '先处理最重要的', value: 'important', description: '处理最核心的问题' },
      { label: '一步步来', value: 'step_by_step', description: '按顺序逐步处理' }
    ]
  }
};

/**
 * 工具子类型引导模板
 */
const TOOL_CATEGORY_GUIDANCE = {
  [TOOL_SUB_TYPES.WEB_SEARCH]: {
    question: '您想搜索什么类型的内容？',
    options: [
      { label: '技术文档', value: 'tech_docs', description: 'API文档、教程或技术文章' },
      { label: '最新资讯', value: 'news', description: '新闻、动态或行业信息' },
      { label: '代码示例', value: 'code_examples', description: '编程代码或解决方案' },
      { label: '通用搜索', value: 'general', description: '其他一般性内容' }
    ]
  },
  [TOOL_SUB_TYPES.CALCULATOR]: {
    question: '您需要进行什么类型的计算？',
    options: [
      { label: '数学运算', value: 'math', description: '基础数学计算' },
      { label: '数据转换', value: 'conversion', description: '单位、格式转换' },
      { label: '数据分析', value: 'analysis', description: '统计分析或数据处理' }
    ]
  },
  [TOOL_SUB_TYPES.TRANSLATION]: {
    question: '您想翻译什么类型的内容？',
    options: [
      { label: '技术文档', value: 'tech', description: '技术文档或代码注释' },
      { label: '商务文本', value: 'business', description: '商务邮件或合同' },
      { label: '日常对话', value: 'casual', description: '日常交流内容' }
    ]
  },
  [TOOL_SUB_TYPES.IMAGE_GENERATION]: {
    question: '您想生成什么样的图片？',
    options: [
      { label: '技术图解', value: 'diagram', description: '架构图、流程图或示意图' },
      { label: '创意插画', value: 'illustration', description: '艺术插画或设计素材' },
      { label: 'Logo设计', value: 'logo', description: '品牌标识或图标设计' }
    ]
  }
};

/**
 * 任务子类型引导模板
 */
const TASK_CATEGORY_GUIDANCE = {
  [TASK_SUB_TYPES.ANALYSIS]: {
    question: '您想分析什么内容？',
    options: [
      { label: '代码分析', value: 'code', description: '分析代码质量、结构或性能' },
      { label: '数据洞察', value: 'data', description: '分析数据趋势或规律' },
      { label: '方案评估', value: 'evaluation', description: '评估方案或策略的可行性' }
    ]
  },
  [TASK_SUB_TYPES.SUMMARY]: {
    question: '您想总结什么内容？',
    options: [
      { label: '长文章', value: 'article', description: '文章、博客或报告' },
      { label: '会议内容', value: 'meeting', description: '会议记录或讨论要点' },
      { label: '文档要点', value: 'document', description: '技术文档或产品规格' }
    ]
  },
  [TASK_SUB_TYPES.CODING]: {
    question: '您需要什么样的编程帮助？',
    options: [
      { label: '写新代码', value: 'write', description: '编写新的代码功能' },
      { label: '调试问题', value: 'debug', description: '修复代码中的错误' },
      { label: '优化代码', value: 'optimize', description: '提升代码性能或可读性' }
    ]
  }
};

/**
 * 通用低置信度引导（当无法确定意图时）
 */
const GENERAL_GUIDANCE = {
  question: '抱歉，我没有完全理解您的意思。请问您是想：',
  options: [
    { label: '技术咨询', value: 'knowledge', description: '了解某个技术概念或原理' },
    { label: '工具使用', value: 'tool', description: '使用搜索、翻译等工具功能' },
    { label: '任务执行', value: 'task', description: '完成分析、总结等任务' },
    { label: '创意生成', value: 'creative', description: '生成文章、图片或创意内容' }
  ]
};

// ==================== 主类实现 ====================

/**
 * 意图澄清引导服务
 */
class IntentGuidanceService {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   * @param {number} options.confidenceThreshold - 置信度阈值（默认0.5）
   * @param {boolean} options.enableMultiLevel - 启用多层级引导（默认true）
   * @param {Object} options.customTemplates - 自定义引导模板
   */
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold || GUIDANCE_THRESHOLDS.MEDIUM_CONFIDENCE;
    this.enableMultiLevel = options.enableMultiLevel !== false;
    this.customTemplates = options.customTemplates || {};

    // 合并自定义模板
    this.domainGuidance = { ...DOMAIN_GUIDANCE, ...this.customTemplates.domain };
    this.toolGuidance = { ...TOOL_CATEGORY_GUIDANCE, ...this.customTemplates.tool };
    this.taskGuidance = { ...TASK_CATEGORY_GUIDANCE, ...this.customTemplates.task };

    // 统计信息
    this.stats = {
      totalGuidances: 0,
      domainLevelGuidances: 0,
      categoryLevelGuidances: 0,
      topicLevelGuidances: 0,
      averageConfidence: 0
    };
  }

  /**
   * 检查是否需要引导
   *
   * @param {Object} intentResult - 意图分类结果
   * @returns {boolean} 是否需要引导
   */
  needsGuidance(intentResult) {
    if (!intentResult) return true;
    return intentResult.confidence < this.confidenceThreshold;
  }

  /**
   * 生成引导问题
   *
   * @param {Object} intentResult - 意图分类结果
   * @param {Object} context - 上下文信息
   * @returns {Object} 引导结果
   */
  generateGuidanceQuestion(intentResult, context = {}) {
    this.stats.totalGuidances++;

    // 判断应该使用哪个层级的引导
    const guidanceLevel = this._determineGuidanceLevel(intentResult);
    const guidance = this._selectGuidanceTemplate(intentResult, guidanceLevel);

    // 更新统计
    this._updateStats(intentResult.confidence, guidanceLevel);

    return {
      type: 'guidance',
      level: guidanceLevel,
      question: guidance.question,
      options: guidance.options,
      currentIntent: intentResult?.intent || null,
      currentConfidence: intentResult?.confidence || 0,
      timestamp: Date.now()
    };
  }

  /**
   * 生成选项列表
   *
   * @param {Object} intentResult - 意图分类结果
   * @returns {Array} 选项列表
   */
  generateOptions(intentResult) {
    const guidance = this._selectGuidanceTemplate(intentResult, this._determineGuidanceLevel(intentResult));
    return guidance.options;
  }

  /**
   * 根据选项选择结果生成修正后的意图
   *
   * @param {Object} intentResult - 原始意图结果
   * @param {string} selectedValue - 用户选择的选项值
   * @returns {Object} 修正后的意图结果
   */
  applyUserSelection(intentResult, selectedValue) {
    if (!intentResult) {
      // 如果原始结果为空，根据选择创建新结果
      const intentMap = {
        knowledge: INTENT_TYPES.KNOWLEDGE_QA,
        tool: INTENT_TYPES.TOOL_USE,
        task: INTENT_TYPES.TASK_EXECUTION,
        creative: 'creative',
        chat: INTENT_TYPES.CASUAL_CHAT
      };
      return {
        intent: intentMap[selectedValue] || INTENT_TYPES.CASUAL_CHAT,
        confidence: 0.9,
        source: 'user_selection',
        refinement: 'refined'
      };
    }

    // 根据选择细化意图
    const refinedIntent = { ...intentResult };
    refinedIntent.confidence = 0.9;
    refinedIntent.refinement = 'refined';
    refinedIntent.selectedOption = selectedValue;

    // 如果选择了更具体的子类型，更新subIntent
    if (selectedValue && intentResult.subIntent) {
      // 检查是否选择了子类别
      const subIntentMap = this._getSubIntentMapping(intentResult.intent);
      if (subIntentMap && subIntentMap[selectedValue]) {
        refinedIntent.subIntent = subIntentMap[selectedValue];
      }
    }

    return refinedIntent;
  }

  /**
   * 确定引导层级
   *
   * @private
   * @param {Object} intentResult - 意图结果
   * @returns {string} 引导层级
   */
  _determineGuidanceLevel(intentResult) {
    if (!intentResult || !intentResult.intent) {
      return GUIDANCE_LEVELS.DOMAIN;
    }

    const confidence = intentResult.confidence || 0;

    // 极低置信度：使用领域级引导
    if (confidence < GUIDANCE_THRESHOLDS.LOW_CONFIDENCE) {
      return GUIDANCE_LEVELS.DOMAIN;
    }

    // 有主意图但置信度不够：使用类目级引导
    if (intentResult.intent && confidence < GUIDANCE_THRESHOLDS.MEDIUM_CONFIDENCE) {
      return GUIDANCE_LEVELS.CATEGORY;
    }

    // 有子意图但不确定：使用话题级引导
    if (intentResult.subIntent && confidence < GUIDANCE_THRESHOLDS.HIGH_CONFIDENCE) {
      return GUIDANCE_LEVELS.TOPIC;
    }

    return GUIDANCE_LEVELS.CATEGORY;
  }

  /**
   * 选择引导模板
   *
   * @private
   * @param {Object} intentResult - 意图结果
   * @param {string} level - 引导层级
   * @returns {Object} 引导模板
   */
  _selectGuidanceTemplate(intentResult, level) {
    const intent = intentResult?.intent;

    // 领域级引导
    if (level === GUIDANCE_LEVELS.DOMAIN) {
      if (intent && this.domainGuidance[intent]) {
        this.stats.domainLevelGuidances++;
        return this.domainGuidance[intent];
      }
      this.stats.domainLevelGuidances++;
      return GENERAL_GUIDANCE;
    }

    // 类目级引导（基于子类型）
    if (level === GUIDANCE_LEVELS.CATEGORY) {
      // 工具类意图使用工具类别引导
      if (intent === INTENT_TYPES.TOOL_USE && intentResult?.subIntent) {
        this.stats.categoryLevelGuidances++;
        return this.toolGuidance[intentResult.subIntent] || this.domainGuidance[intent];
      }
      // 任务类意图使用任务类别引导
      if (intent === INTENT_TYPES.TASK_EXECUTION && intentResult?.subIntent) {
        this.stats.categoryLevelGuidances++;
        return this.taskGuidance[intentResult.subIntent] || this.domainGuidance[intent];
      }
      // 默认使用领域级引导
      this.stats.categoryLevelGuidances++;
      return this.domainGuidance[intent] || GENERAL_GUIDANCE;
    }

    // 话题级引导
    this.stats.topicLevelGuidances++;
    return this.domainGuidance[intent] || GENERAL_GUIDANCE;
  }

  /**
   * 获取子意图映射
   *
   * @private
   * @param {string} intent - 意图类型
   * @returns {Object|null} 子意图映射表
   */
  _getSubIntentMapping(intent) {
    if (intent === INTENT_TYPES.TOOL_USE) {
      return {
        search: TOOL_SUB_TYPES.WEB_SEARCH,
        calculator: TOOL_SUB_TYPES.CALCULATOR,
        translation: TOOL_SUB_TYPES.TRANSLATION,
        image_generation: TOOL_SUB_TYPES.IMAGE_GENERATION
      };
    }
    if (intent === INTENT_TYPES.TASK_EXECUTION) {
      return {
        analysis: TASK_SUB_TYPES.ANALYSIS,
        summary: TASK_SUB_TYPES.SUMMARY,
        coding: TASK_SUB_TYPES.CODING,
        writing: TASK_SUB_TYPES.WRITING
      };
    }
    return null;
  }

  /**
   * 更新统计信息
   *
   * @private
   * @param {number} confidence - 置信度
   * @param {string} level - 引导层级
   */
  _updateStats(confidence, level) {
    const total = this.stats.totalGuidances;
    this.stats.averageConfidence =
      (this.stats.averageConfidence * (total - 1) + confidence) / total;
  }

  /**
   * 获取统计信息
   *
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      guidanceRate: this.stats.totalGuidances > 0
        ? (this.stats.totalGuidances / this.stats.totalGuidances * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * 重置统计信息
   *
   * @returns {IntentGuidanceService} this
   */
  resetStats() {
    this.stats = {
      totalGuidances: 0,
      domainLevelGuidances: 0,
      categoryLevelGuidances: 0,
      topicLevelGuidances: 0,
      averageConfidence: 0
    };
    return this;
  }
}

module.exports = {
  IntentGuidanceService,
  GUIDANCE_LEVELS,
  GUIDANCE_THRESHOLDS,
  GUIDANCE_TYPES: {
    DOMAIN: 'domain',
    CATEGORY: 'category',
    TOPIC: 'topic'
  }
};
