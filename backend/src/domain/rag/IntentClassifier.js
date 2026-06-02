/**
 * TreeIntentClassifier - 树形多级意图分类组件
 *
 * 功能说明：
 * - 实现三级树形意图分类：领域(Domain) -> 类目(Category) -> 话题(Topic)
 * - 从根节点遍历到叶节点，每层计算置信度
 * - 低置信度时返回澄清问题，而非硬猜答案
 *
 * 树形结构设计：
 * - Level 1 (领域): 技术咨询、代码开发、数据分析、日常交流等
 * - Level 2 (类目): 编程语言、框架、工具、数据库等
 * - Level 3 (话题): 具体问题主题（如 Python基础、React组件等）
 *
 * 企业级设计要点：
 * - 树形结构：支持多级精细化分类
 * - 策略模式：支持关键词和LLM两种分类策略
 * - 观察者模式：支持事件发布便于监控
 * - 可配置：意图树结构可配置化
 *
 * @author AI Chat 玩具团队
 * @date 2026-04-01
 */

const EventEmitter = require('events');
const AppError = require('../../common/errors/AppError');
const { createLogger } = require('../../infra/logger/AgentLogger');

const logger = createLogger('intentClassifier');

// ==================== 常量定义 ====================

/**
 * 意图层级枚举
 */
const INTENT_LEVELS = {
  DOMAIN: 1,      // 领域层
  CATEGORY: 2,    // 类目层
  TOPIC: 3        // 话题层
};

/**
 * 领域类型枚举 (Level 1)
 */
const DOMAIN_TYPES = {
  TECHNOLOGY_CONSULT: 'technology_consult',     // 技术咨询
  CODE_DEVELOPMENT: 'code_development',         // 代码开发
  DATA_ANALYSIS: 'data_analysis',               // 数据分析
  DAILY_COMMUNICATION: 'daily_communication',   // 日常交流
  CREATIVE_GENERATION: 'creative_generation',   // 创意生成
  TOOL_OPERATION: 'tool_operation'             // 工具操作
};

/**
 * 兼容旧版 INTENT_TYPES (保持向后兼容)
 */
const INTENT_TYPES = {
  KNOWLEDGE_QA: 'knowledge_qa',
  TOOL_USE: 'tool_use',
  TASK_EXECUTION: 'task_execution',
  CASUAL_CHAT: 'casual_chat',
  COMPLEX: 'complex'
};

/**
 * 兼容旧版子类型枚举
 */
const TOOL_SUB_TYPES = {
  WEB_SEARCH: 'web_search',
  FILE_OPERATION: 'file_operation',
  API_CALL: 'api_call',
  IMAGE_GENERATION: 'image_generation',
  CALCULATOR: 'calculator',
  TRANSLATION: 'translation'
};

const TASK_SUB_TYPES = {
  DATA_PROCESS: 'data_process',
  VISUALIZATION: 'visualization',
  STATISTICS: 'statistics',
  CODE_WRITE: 'code_write',
  CODE_DEBUG: 'code_debug',
  CODE_REVIEW: 'code_review',
  REFACTOR: 'refactor',
  SUMMARY: 'summary'
};

/**
 * 类目类型枚举 (Level 2)
 */
const CATEGORY_TYPES = {
  // 技术咨询类目
  PROGRAMMING_LANGUAGE: 'programming_language',   // 编程语言
  FRAMEWORK: 'framework',                         // 框架
  LIBRARY: 'library',                             // 库/工具包
  SYSTEM_ARCHITECTURE: 'system_architecture',    // 系统架构
  ALGORITHM: 'algorithm',                         // 算法
  CONCEPT: 'concept',                            // 概念解释

  // 代码开发类目
  CODE_WRITE: 'code_write',                       // 写代码
  CODE_DEBUG: 'code_debug',                        // 调试代码
  CODE_REVIEW: 'code_review',                     // 代码审查
  REFACTOR: 'refactor',                           // 重构
  SUMMARY: 'summary',                             // 总结

  // 数据分析类目
  DATA_PROCESS: 'data_process',                   // 数据处理
  VISUALIZATION: 'visualization',                 // 可视化
  STATISTICS: 'statistics',                        // 统计分析

  // 日常交流类目
  CASUAL_CHAT: 'casual_chat',                     // 闲聊
  QUESTION_ANSWER: 'question_answer',             // 问答

  // 创意生成类目
  IMAGE_GENERATION: 'image_generation',           // 图像生成
  TEXT_GENERATION: 'text_generation',             // 文本生成

  // 工具操作类目
  WEB_SEARCH: 'web_search',                       // 网页搜索
  FILE_OPERATION: 'file_operation',              // 文件操作
  API_CALL: 'api_call'                            // API调用
};

/**
 * 置信度等级
 */
const CONFIDENCE_LEVELS = {
  HIGH: { min: 0.8, label: '高置信度' },
  MEDIUM: { min: 0.5, label: '中等置信度' },
  LOW: { min: 0.3, label: '低置信度' },
  VERY_LOW: { min: 0, label: '极低置信度' }
};

/**
 * 澄清阈值配置
 */
const CLARIFICATION_THRESHOLDS = {
  DOMAIN_MIN: 0.3,     // 领域层最低置信度
  CATEGORY_MIN: 0.25, // 类目层最低置信度
  TOPIC_MIN: 0.2,     // 话题层最低置信度
  FINAL_MIN: 0.2       // 最终结果最低置信度
};

// ==================== 意图树定义 ====================

/**
 * 默认意图树配置
 * 支持三级分类：领域 -> 类目 -> 话题
 */
const DEFAULT_INTENT_TREE = {
  id: 'root',
  name: '根节点',
  level: 0,
  children: [
    // ==================== 技术咨询领域 ====================
    {
      id: DOMAIN_TYPES.TECHNOLOGY_CONSULT,
      name: '技术咨询',
      level: INTENT_LEVELS.DOMAIN,
      keywords: ['什么是', '是什么', '什么意思', '介绍', '讲解', '解释', '说明', '原理', '为什么', '原因', '区别', '比较', '如何', '怎么', '怎样', '教程', '方法', '步骤', 'what is', 'explain', 'how to', 'why', 'difference'],
      children: [
        {
          id: CATEGORY_TYPES.CONCEPT,
          name: '概念解释',
          keywords: ['什么叫', '定义', '概念', '含义', '意思', 'meaning', 'definition'],
          children: []
        },
        {
          id: CATEGORY_TYPES.PROGRAMMING_LANGUAGE,
          name: '编程语言',
          keywords: ['Python', 'JavaScript', 'TypeScript', 'Java', 'Go', 'Rust', 'C++', 'Ruby', 'PHP', 'Swift', 'Kotlin', '编程语言', '语言'],
          children: []
        },
        {
          id: CATEGORY_TYPES.FRAMEWORK,
          name: '框架',
          keywords: ['React', 'Vue', 'Angular', 'Node.js', 'Django', 'Flask', 'Spring', 'Next.js', 'Nuxt', '框架'],
          children: []
        },
        {
          id: CATEGORY_TYPES.LIBRARY,
          name: '库/工具包',
          keywords: ['npm', 'pip', 'yarn', 'pytorch', 'tensorflow', 'numpy', 'pandas', 'jquery', 'lodash', '库', '包', 'package'],
          children: []
        },
        {
          id: CATEGORY_TYPES.SYSTEM_ARCHITECTURE,
          name: '系统架构',
          keywords: ['微服务', '分布式', '缓存', '数据库', '架构', '设计模式', '云原生', 'docker', 'kubernetes', 'architecture', 'microservice'],
          children: []
        },
        {
          id: CATEGORY_TYPES.ALGORITHM,
          name: '算法',
          keywords: ['算法', '排序', '搜索', '图论', '动态规划', '机器学习', '深度学习', '神经网络', 'transformer', 'attention', 'algorithm', 'ml', 'dl'],
          children: []
        }
      ]
    },

    // ==================== 代码开发领域 ====================
    {
      id: DOMAIN_TYPES.CODE_DEVELOPMENT,
      name: '代码开发',
      level: INTENT_LEVELS.DOMAIN,
      keywords: ['写', '写代码', '编程', '开发', '代码', '程序', '函数', '类', '接口', '总结', '概括', '提炼', '汇总', '算法', '排序', '调试', 'debug', '审查', '优化', '改进', '重构', 'coding', 'programming', 'code', 'function', 'class', 'summarize', 'summary', 'algorithm', 'debug'],
      children: [
        {
          id: CATEGORY_TYPES.CODE_WRITE,
          name: '编写代码',
          keywords: ['写', '创建', '编写', '实现', 'write', 'create', 'implement', 'build'],
          children: []
        },
        {
          id: CATEGORY_TYPES.CODE_DEBUG,
          name: '调试代码',
          keywords: ['调试', 'debug', '错误', 'exception', '报错', '修复', 'fix', 'bug', '问题'],
          children: []
        },
        {
          id: CATEGORY_TYPES.CODE_REVIEW,
          name: '代码审查',
          keywords: ['审查', 'review', '优化', '改进', '建议', 'improve', 'optimize', 'refactor'],
          children: []
        },
        {
          id: CATEGORY_TYPES.REFACTOR,
          name: '重构',
          keywords: ['重构', 'refactor', '重写', '改造', 'restructure'],
          children: []
        },
        {
          id: CATEGORY_TYPES.SUMMARY,
          name: '总结',
          keywords: ['总结', '概括', '提炼', '汇总', 'summarize', 'summary', 'outline'],
          children: []
        }
      ]
    },

    // ==================== 数据分析领域 ====================
    {
      id: DOMAIN_TYPES.DATA_ANALYSIS,
      name: '数据分析',
      level: INTENT_LEVELS.DOMAIN,
      keywords: ['分析', '分析一下', '数据', '统计', '图表', '可视化', '对比', '评估', 'analyze', 'analysis', 'data', 'statistics', 'chart', 'compare', 'evaluate'],
      children: [
        {
          id: CATEGORY_TYPES.DATA_PROCESS,
          name: '数据处理',
          keywords: ['处理', '清洗', '转换', ' ETL', 'process', 'clean', 'transform'],
          children: []
        },
        {
          id: CATEGORY_TYPES.VISUALIZATION,
          name: '可视化',
          keywords: ['图表', '可视化', 'dashboard', 'graph', 'chart', 'plot', 'visualization'],
          children: []
        },
        {
          id: CATEGORY_TYPES.STATISTICS,
          name: '统计分析',
          keywords: ['统计', '回归', '聚类', '预测', 'statistics', 'regression', 'clustering', 'prediction'],
          children: []
        }
      ]
    },

    // ==================== 日常交流领域 ====================
    {
      id: DOMAIN_TYPES.DAILY_COMMUNICATION,
      name: '日常交流',
      level: INTENT_LEVELS.DOMAIN,
      keywords: ['你好', '嗨', '早上好', '晚上好', '在吗', 'hello', 'hi', 'hey', 'good morning', '谢谢', '感谢', 'thanks'],
      children: [
        {
          id: CATEGORY_TYPES.CASUAL_CHAT,
          name: '闲聊',
          keywords: ['吗', '呢', '啊', '哦', '嗯', '？', '聊', '说说'],
          children: []
        },
        {
          id: CATEGORY_TYPES.QUESTION_ANSWER,
          name: '问答',
          keywords: ['问', '答', '问题', '回答', 'question', 'answer', '？'],
          children: []
        }
      ]
    },

    // ==================== 创意生成领域 ====================
    {
      id: DOMAIN_TYPES.CREATIVE_GENERATION,
      name: '创意生成',
      level: INTENT_LEVELS.DOMAIN,
      keywords: ['生成', '创作', '写文章', '写诗', '写故事', 'create', 'generate', 'write'],
      children: [
        {
          id: CATEGORY_TYPES.TEXT_GENERATION,
          name: '文本生成',
          keywords: ['写', '生成文本', '创作', '写文章', '写诗', '写故事', 'write', 'generate text', 'create article', '写作'],
          children: []
        }
      ]
    },

    // ==================== 工具操作领域 ====================
    {
      id: DOMAIN_TYPES.TOOL_OPERATION,
      name: '工具操作',
      level: INTENT_LEVELS.DOMAIN,
      keywords: ['搜索', '计算', '翻译', '获取', '请求', '调用', '画', '绘图', 'search', 'calculate', 'translate', 'fetch', 'call', 'draw'],
      children: [
        {
          id: CATEGORY_TYPES.WEB_SEARCH,
          name: '网页搜索',
          keywords: ['搜索', '搜一下', '查找', '查询', 'search', 'find', 'lookup', 'google', '百度'],
          children: []
        },
        {
          id: CATEGORY_TYPES.FILE_OPERATION,
          name: '文件操作',
          keywords: ['读取', '写入', '保存', '打开', '创建文件', 'read', 'write', 'save', 'file'],
          children: []
        },
        {
          id: CATEGORY_TYPES.API_CALL,
          name: 'API调用',
          keywords: ['调用', '请求', 'api', 'endpoint', 'http', 'request', 'fetch'],
          children: []
        },
        {
          id: CATEGORY_TYPES.IMAGE_GENERATION,
          name: '图像生成',
          keywords: ['画', '生成图片', '画一个', '帮我画', 'draw', 'generate image', 'create image', '生成图像', '绘图'],
          children: []
        }
      ]
    }
  ]
};

// ==================== 意图节点类 ====================

/**
 * 意图节点类
 * 表示意图树中的一个节点
 */
class IntentNode {
  /**
   * @param {Object} config - 节点配置
   * @param {string} config.id - 节点ID
   * @param {string} config.name - 节点名称
   * @param {number} config.level - 节点层级 (1-3)
   * @param {string[]} config.keywords - 关键词列表
   * @param {IntentNode[]} config.children - 子节点
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.level = config.level || 0;
    this.keywords = config.keywords || [];
    this.children = (config.children || []).map(child => new IntentNode(child));
    this.confidence = 0;  // 当前置信度
    this.matchedKeywords = [];  // 匹配的关键词
  }

  /**
   * 计算节点与查询的匹配度
   * @param {string} query - 查询文本
   * @returns {number} 匹配得分
   */
  calculateMatchScore(query) {
    const queryLower = query.toLowerCase();
    let score = 0;
    this.matchedKeywords = [];

    for (const keyword of this.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (queryLower.includes(keywordLower)) {
        // 关键词越长，权重越高
        const weight = keyword.length * 1.5;
        score += weight;
        this.matchedKeywords.push({
          keyword,
          weight
        });
      }
    }

    return score;
  }

  /**
   * 检查是否为叶节点
   * @returns {boolean}
   */
  isLeaf() {
    return this.children.length === 0;
  }

  /**
   * 获取节点路径
   * @returns {string[]} 从根到该节点的路径
   */
  getPath() {
    return [this.id];
  }

  /**
   * 克隆节点
   * @returns {IntentNode}
   */
  clone() {
    return new IntentNode({
      id: this.id,
      name: this.name,
      level: this.level,
      keywords: [...this.keywords],
      children: this.children.map(child => child.clone())
    });
  }
}

// ==================== 树形意图分类器类 ====================

/**
 * 树形意图分类器
 *
 * @extends EventEmitter
 */
class TreeIntentClassifier extends EventEmitter {
  /**
   * 构造函数
   *
   * @param {Object} options - 配置选项
   * @param {Object} options.modelClient - ChatModelClient实例（可选）
   * @param {string} options.defaultModel - 默认模型（默认MiniMax-M2.7）
   * @param {number} options.confidenceThreshold - 置信度阈值（默认0.5）
   * @param {boolean} options.enableLLM - 启用LLM分类（默认true）
   * @param {boolean} options.enableKeywordFallback - 启用关键词后备（默认true）
   * @param {Object} options.intentTree - 意图树配置（可选，默认使用DEFAULT_INTENT_TREE）
   * @param {number} options.domainThreshold - 领域层置信度阈值
   * @param {number} options.categoryThreshold - 类目层置信度阈值
   * @param {number} options.topicThreshold - 话题层置信度阈值
   */
  constructor(options = {}) {
    super();

    // 模型客户端
    this.modelClient = options.modelClient || null;
    this.defaultModel = options.defaultModel || 'MiniMax-M2.7';
    this.confidenceThreshold = options.confidenceThreshold || 0.5;
    this.enableLLM = options.enableLLM !== false;
    this.enableKeywordFallback = options.enableKeywordFallback !== false;

    // 树形结构配置
    this.intentTree = this._buildTree(options.intentTree || DEFAULT_INTENT_TREE);

    // 分层阈值配置
    this.thresholds = {
      domain: options.domainThreshold || CLARIFICATION_THRESHOLDS.DOMAIN_MIN,
      category: options.categoryThreshold || CLARIFICATION_THRESHOLDS.CATEGORY_MIN,
      topic: options.topicThreshold || CLARIFICATION_THRESHOLDS.TOPIC_MIN,
      final: CLARIFICATION_THRESHOLDS.FINAL_MIN
    };

    // 统计信息
    this.stats = {
      totalClassifications: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      keywordFallbacks: 0,
      clarifications: 0,
      treeMatches: 0,
      averageLatencyMs: 0
    };

    // 反向映射：兼容旧接口
    this.intentTypeMap = this._buildIntentTypeMap();
  }

  /**
   * 构建意图树
   * @private
   * @param {Object} treeConfig - 树配置
   * @returns {IntentNode}
   */
  _buildTree(treeConfig) {
    return new IntentNode(treeConfig);
  }

  /**
   * 构建意图类型映射（兼容旧接口）
   * @private
   * @returns {Map}
   */
  _buildIntentTypeMap() {
    const map = new Map();

    // 旧版意图类型 -> 新版领域类型映射
    map.set('knowledge', DOMAIN_TYPES.TECHNOLOGY_CONSULT);
    map.set('knowledge_qa', DOMAIN_TYPES.TECHNOLOGY_CONSULT);
    map.set('chat', DOMAIN_TYPES.DAILY_COMMUNICATION);
    map.set('casual_chat', DOMAIN_TYPES.DAILY_COMMUNICATION);
    map.set('task', DOMAIN_TYPES.CODE_DEVELOPMENT);
    map.set('task_execution', DOMAIN_TYPES.CODE_DEVELOPMENT);
    map.set('tool_use', DOMAIN_TYPES.TOOL_OPERATION);
    map.set('complex', DOMAIN_TYPES.TECHNOLOGY_CONSULT);  // complex映射到技术咨询

    return map;
  }

  /**
   * 主分类接口
   *
   * @param {string} query - 用户查询
   * @param {Object} context - 上下文信息
   * @param {Array} context.messages - 历史消息
   * @param {Array} context.tools - 可用工具
   * @param {string} context.userId - 用户ID
   * @returns {Promise<Object>} 分类结果
   *
   * @returns {string} .intent - 意图类型（兼容旧接口）
   * @returns {string} .domain - 领域类型 (Level 1)
   * @returns {string} .category - 类目类型 (Level 2)
   * @returns {string} .topic - 话题类型 (Level 3)
   * @returns {number} .confidence - 置信度 (0-1)
   * @returns {number} .domainConfidence - 领域层置信度
   * @returns {number} .categoryConfidence - 类目层置信度
   * @returns {number} .topicConfidence - 话题层置信度
   * @returns {string} .clarification - 澄清问题
   * @returns {string} .source - 分类来源 (tree/llm/keyword/special_pattern)
   * @returns {string} .reasoning - 推理过程
   * @returns {Object} .treePath - 完整树路径
   */
  async classify(query, context = {}) {
    const startTime = Date.now();
    this.stats.totalClassifications++;

    try {
      // 空查询返回日常交流
      if (!query || query.trim() === '') {
        const result = this._buildResult(DOMAIN_TYPES.DAILY_COMMUNICATION, null, null, 0.4, 'empty_query', '空查询');
        this._updateLatency(startTime);
        return result;
      }

      const trimmedQuery = query.trim();

      // 1. 树形结构匹配（最高优先级）
      const treeResult = this._classifyWithTree(trimmedQuery);
      if (treeResult.confidence >= this.thresholds.final) {
        this.stats.treeMatches++;
        this._updateLatency(startTime);

        // 低置信度需要澄清
        if (treeResult.confidence < CONFIDENCE_LEVELS.HIGH.min) {
          return this._addClarification(treeResult, trimmedQuery);
        }

        return treeResult;
      }

      // 2. LLM分类（如启用）
      if (this.enableLLM && this.modelClient) {
        try {
          const llmResult = await this._classifyWithLLM(trimmedQuery, context);

          if (llmResult.confidence >= this.thresholds.final) {
            this.stats.llmSuccesses++;
            this._updateLatency(startTime);

            if (llmResult.confidence < CONFIDENCE_LEVELS.HIGH.min) {
              return this._addClarification(llmResult, trimmedQuery);
            }

            return llmResult;
          }
        } catch (error) {
          this.stats.llmFailures++;
          logger.warn('LLM分类失败，降级到关键词匹配', { error: error.message });
        }
      }

      // 3. 关键词匹配后备
      if (this.enableKeywordFallback) {
        this.stats.keywordFallbacks++;
        const keywordResult = this._classifyWithKeywords(trimmedQuery);
        this._updateLatency(startTime);

        if (keywordResult.confidence >= this.thresholds.final) {
          if (keywordResult.confidence < CONFIDENCE_LEVELS.HIGH.min) {
            return this._addClarification(keywordResult, trimmedQuery);
          }
          return keywordResult;
        }
      }

      // 4. 最低置信度返回闲聊
      const defaultResult = this._buildResult(
        DOMAIN_TYPES.DAILY_COMMUNICATION,
        null,
        null,
        0.3,
        'low_confidence',
        '低置信度'
      );
      this._updateLatency(startTime);
      return this._addClarification(defaultResult, trimmedQuery);

    } catch (error) {
      logger.error('分类异常', { error: error.message });
      this._updateLatency(startTime);
      return this._buildResult(
        DOMAIN_TYPES.DAILY_COMMUNICATION,
        null,
        null,
        0.2,
        'error',
        '异常'
      );
    }
  }

  /**
   * 使用树形结构进行意图分类
   * @private
   * @param {string} query - 查询文本
   * @returns {Object} 分类结果
   */
  _classifyWithTree(query) {
    const root = this.intentTree;
    let bestDomain = null;
    let bestCategory = null;
    let bestTopic = null;
    let domainConfidence = 0;
    let categoryConfidence = 0;
    let topicConfidence = 0;

    // Level 1: 遍历领域层
    let bestDomainScore = 0;
    for (const domainNode of root.children) {
      const score = domainNode.calculateMatchScore(query);
      if (score > bestDomainScore) {
        bestDomainScore = score;
        bestDomain = domainNode;
      }
    }

    // 计算领域层置信度
    if (bestDomain && bestDomainScore > 0) {
      domainConfidence = Math.min(0.3 + (bestDomainScore / 50) * 0.5, 0.95);
    } else {
      // 无关键词匹配，使用基础置信度
      domainConfidence = 0.3;
    }

    // Level 2: 遍历类目层
    if (bestDomain && bestDomain.children.length > 0) {
      let bestCategoryScore = 0;
      for (const categoryNode of bestDomain.children) {
        const score = categoryNode.calculateMatchScore(query);
        if (score > bestCategoryScore) {
          bestCategoryScore = score;
          bestCategory = categoryNode;
        }
      }

      // 计算类目层置信度
      if (bestCategory && bestCategoryScore > 0) {
        categoryConfidence = Math.min(0.25 + (bestCategoryScore / 30) * 0.45, 0.9);
      } else {
        categoryConfidence = domainConfidence * 0.7;  // 类目置信度受领域影响
      }

      // Level 3: 遍历话题层
      if (bestCategory && bestCategory.children.length > 0) {
        let bestTopicScore = 0;
        for (const topicNode of bestCategory.children) {
          const score = topicNode.calculateMatchScore(query);
          if (score > bestTopicScore) {
            bestTopicScore = score;
            bestTopic = topicNode;
          }
        }

        // 计算话题层置信度
        if (bestTopic && bestTopicScore > 0) {
          topicConfidence = Math.min(0.2 + (bestTopicScore / 20) * 0.4, 0.85);
        } else {
          topicConfidence = categoryConfidence * 0.6;  // 话题置信度受类目影响
        }
      }
    }

    // 计算最终置信度（加权平均）
    const finalConfidence = this._calculateFinalConfidence(
      domainConfidence,
      categoryConfidence,
      topicConfidence
    );

    // 构建树路径
    const treePath = {
      domain: bestDomain ? { id: bestDomain.id, name: bestDomain.name } : null,
      category: bestCategory ? { id: bestCategory.id, name: bestCategory.name } : null,
      topic: bestTopic ? { id: bestTopic.id, name: bestTopic.name } : null,
      matchedKeywords: this._collectMatchedKeywords(query)
    };

    return this._buildResult(
      bestDomain ? bestDomain.id : DOMAIN_TYPES.DAILY_COMMUNICATION,
      bestCategory ? bestCategory.id : null,
      bestTopic ? bestTopic.id : null,
      finalConfidence,
      'tree',
      `树形匹配: ${bestDomain?.name || '未匹配'} -> ${bestCategory?.name || '未匹配'} -> ${bestTopic?.name || '未匹配'}`,
      { domainConfidence, categoryConfidence, topicConfidence },
      treePath
    );
  }

  /**
   * 收集所有匹配的关键词
   * @private
   * @param {string} query - 查询文本
   * @returns {string[]}
   */
  _collectMatchedKeywords(query) {
    const keywords = [];
    const queryLower = query.toLowerCase();

    const collectFromNode = (node) => {
      for (const keyword of node.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          keywords.push(keyword);
        }
      }
      for (const child of node.children) {
        collectFromNode(child);
      }
    };

    collectFromNode(this.intentTree);
    return [...new Set(keywords)];  // 去重
  }

  /**
   * 计算最终置信度
   * @private
   * @param {number} domainConf - 领域置信度
   * @param {number} categoryConf - 类目置信度
   * @param {number} topicConf - 话题置信度
   * @returns {number}
   */
  _calculateFinalConfidence(domainConf, categoryConf, topicConf) {
    // 简单加权计算：领域贡献50%，类目贡献35%，话题贡献15%
    // 如果下层没有匹配，使用上层的置信度作为基础
    let finalScore = domainConf * 0.5;

    if (categoryConf > 0) {
      finalScore += categoryConf * 0.35;
    } else {
      // 如果没有类目匹配，领域置信度贡献更多
      finalScore = domainConf * 0.85;
    }

    if (topicConf > 0) {
      finalScore += topicConf * 0.15;
    }

    return Math.min(finalScore, 0.95);
  }

  /**
   * 使用LLM进行意图分类
   * @private
   * @param {string} query - 查询文本
   * @param {Object} context - 上下文
   * @returns {Promise<Object>} LLM分类结果
   */
  async _classifyWithLLM(query, context = {}) {
    // 构建上下文文本
    let contextText = '无历史上下文';
    if (context.messages && context.messages.length > 0) {
      const recentMessages = context.messages.slice(-4);
      contextText = recentMessages
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 100) : '[多模态内容]'}`)
        .join('\n');
    }

    const prompt = this._buildLLMPrompt(query, contextText);

    const response = await this.modelClient.chat(
      [
        { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
        { role: 'user', content: prompt }
      ],
      {
        model: this.defaultModel,
        temperature: 0.3,
        max_tokens: 600
      }
    );

    const content = MiniMaxChatClient.extractContent(response.content);
    const parsed = this._parseJSONResponse(content);

    // 映射到领域类型
    const domain = this._mapOldIntentToDomain(parsed.intent);
    const category = parsed.category || null;
    const topic = parsed.topic || null;

    return this._buildResult(
      domain,
      category,
      topic,
      Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
      'llm',
      parsed.reasoning || '',
      {
        domainConfidence: parsed.domainConfidence || parsed.confidence || 0.5,
        categoryConfidence: parsed.categoryConfidence || 0,
        topicConfidence: parsed.topicConfidence || 0
      },
      parsed.treePath || null
    );
  }

  /**
   * 构建LLM分类提示
   * @private
   * @param {string} query - 查询文本
   * @param {string} contextText - 上下文文本
   * @returns {string}
   */
  _buildLLMPrompt(query, contextText) {
    return `你是一个精确的三级意图分类助手。请分析用户请求，确定其三级意图分类。

## 用户请求
${query}

## 上下文信息
${contextText}

## 三级意图分类体系

### Level 1 - 领域类型 (domain)
- technology_consult: 技术咨询（概念解释、原理说明、教程方法）
- code_development: 代码开发（写代码、调试、重构）
- data_analysis: 数据分析（处理、可视化、统计）
- daily_communication: 日常交流（闲聊、问答）
- creative_generation: 创意生成（图像生成、文本创作）
- tool_operation: 工具操作（搜索、文件、API调用）

### Level 2 - 类目类型 (category)
技术咨询: concept(概念), programming_language(编程语言), framework(框架), library(库), system_architecture(架构), algorithm(算法)
代码开发: code_write(写代码), code_debug(调试), code_review(审查), refactor(重构)
数据分析: data_process(处理), visualization(可视化), statistics(统计)
日常交流: casual_chat(闲聊), question_answer(问答)
创意生成: image_generation(图像), text_generation(文本)
工具操作: web_search(搜索), file_operation(文件), api_call(API)

### Level 3 - 话题类型 (topic)
具体问题主题，根据前两级分类细化

请以JSON格式返回分类结果：
{
  "intent": "对应domain类型",
  "domain": "domain类型",
  "category": "category类型",
  "topic": "topic类型(可选)",
  "confidence": 0.0-1.0,
  "domainConfidence": 0.0-1.0,
  "categoryConfidence": 0.0-1.0,
  "topicConfidence": 0.0-1.0,
  "reasoning": "简短推理过程（30字以内）",
  "needsClarification": true|false,
  "clarificationQuestion": "如果需要澄清，输出一个简短问题"
}

只返回JSON，不要其他内容。`;
  }

  /**
   * 映射旧意图类型到领域类型
   * @private
   * @param {string} oldIntent - 旧意图类型
   * @returns {string} 领域类型
   */
  _mapOldIntentToDomain(oldIntent) {
    // 先尝试直接映射
    if (this.intentTypeMap.has(oldIntent)) {
      return this.intentTypeMap.get(oldIntent);
    }

    // 尝试模糊匹配
    const oldIntentLower = oldIntent.toLowerCase();
    if (oldIntentLower.includes('knowledge') || oldIntentLower.includes('tech')) {
      return DOMAIN_TYPES.TECHNOLOGY_CONSULT;
    }
    if (oldIntentLower.includes('code') || oldIntentLower.includes('task')) {
      return DOMAIN_TYPES.CODE_DEVELOPMENT;
    }
    if (oldIntentLower.includes('data') || oldIntentLower.includes('analysis')) {
      return DOMAIN_TYPES.DATA_ANALYSIS;
    }
    if (oldIntentLower.includes('chat') || oldIntentLower.includes('casual')) {
      return DOMAIN_TYPES.DAILY_COMMUNICATION;
    }
    if (oldIntentLower.includes('creative') || oldIntentLower.includes('image')) {
      return DOMAIN_TYPES.CREATIVE_GENERATION;
    }
    if (oldIntentLower.includes('tool')) {
      return DOMAIN_TYPES.TOOL_OPERATION;
    }

    return DOMAIN_TYPES.DAILY_COMMUNICATION;  // 默认
  }

  /**
   * 使用关键词进行意图分类（后备方案）
   * @private
   * @param {string} query - 查询文本
   * @returns {Object} 关键词匹配结果
   */
  _classifyWithKeywords(query) {
    // 复用树形结构进行关键词匹配
    return this._classifyWithTree(query);
  }

  /**
   * 构建分类结果对象
   * @private
   */
  _buildResult(intent, category, topic, confidence, source, reasoning = '', levelConfidences = {}, treePath = null) {
    const result = {
      // 兼容旧接口
      intent: intent,
      confidence: confidence,
      source: source,
      reasoning: reasoning,
      timestamp: Date.now(),

      // 新增树形结构字段
      domain: intent,
      category: category || undefined,
      topic: topic || undefined,
      domainConfidence: levelConfidences.domainConfidence || confidence,
      categoryConfidence: levelConfidences.categoryConfidence || 0,
      topicConfidence: levelConfidences.topicConfidence || 0
    };

    if (treePath) {
      result.treePath = treePath;
    }

    return result;
  }

  /**
   * 添加澄清问题（低置信度时）
   * @private
   * @param {Object} result - 当前结果
   * @param {string} query - 原始查询
   * @returns {Object} 添加澄清后的结果
   */
  _addClarification(result, query) {
    this.stats.clarifications++;

    if (result.clarification) {
      return {
        ...result,
        needsClarification: true
      };
    }

    const clarificationQuestion = this._generateClarificationQuestion(query, result);
    return {
      ...result,
      clarification: clarificationQuestion,
      needsClarification: true
    };
  }

  /**
   * 生成澄清问题
   * @private
   * @param {string} query - 原始查询
   * @param {Object} result - 分类结果
   * @returns {string} 澄清问题
   */
  _generateClarificationQuestion(query, result) {
    const domain = result.domain;
    const category = result.category;

    const templates = {
      [DOMAIN_TYPES.TECHNOLOGY_CONSULT]: [
        '您是想了解这个概念的定义，还是想学习相关教程？',
        '请问您想深入了解这个话题的哪个方面？',
        '您是想知道原理还是使用方法？'
      ],
      [DOMAIN_TYPES.CODE_DEVELOPMENT]: [
        '您希望我帮您完成什么任务？',
        '请问您想让我写代码、调试还是审查代码？',
        '您需要我分析、整理还是执行其他操作？'
      ],
      [DOMAIN_TYPES.DATA_ANALYSIS]: [
        '您想对数据做什么处理？',
        '需要生成图表还是进行统计分析？',
        '请问您的数据是什么格式？'
      ],
      [DOMAIN_TYPES.DAILY_COMMUNICATION]: [
        '有什么我可以帮您的？',
        '请问您想聊些什么？',
        '您有什么问题想问我吗？'
      ],
      [DOMAIN_TYPES.CREATIVE_GENERATION]: [
        '您想生成什么类型的内容？',
        '需要图像还是文本创作？',
        '请问您有什么具体的创作想法？'
      ],
      [DOMAIN_TYPES.TOOL_OPERATION]: [
        '您需要我帮您执行什么操作？',
        '请问您想搜索、计算还是做其他事情？',
        '需要我调用哪个工具？'
      ]
    };

    const options = templates[domain] || templates[DOMAIN_TYPES.DAILY_COMMUNICATION];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * 解析LLM返回的JSON
   * @private
   * @param {string} response - LLM响应文本
   * @returns {Object}
   */
  _parseJSONResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      // 尝试修复常见JSON错误
      const fixed = response
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      try {
        return JSON.parse(fixed);
      } catch {
        throw AppError.internalError('JSON解析失败');
      }
    }
  }

  /**
   * 更新延迟统计
   * @private
   * @param {number} startTime - 开始时间戳
   */
  _updateLatency(startTime) {
    const latency = Date.now() - startTime;
    const total = this.stats.totalClassifications;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (total - 1) + latency) / total;
  }

  /**
   * 获取置信度等级标签
   * @param {number} confidence - 置信度
   * @returns {string}
   */
  getConfidenceLevel(confidence) {
    if (confidence >= CONFIDENCE_LEVELS.HIGH.min) return CONFIDENCE_LEVELS.HIGH.label;
    if (confidence >= CONFIDENCE_LEVELS.MEDIUM.min) return CONFIDENCE_LEVELS.MEDIUM.label;
    if (confidence >= CONFIDENCE_LEVELS.LOW.min) return CONFIDENCE_LEVELS.LOW.label;
    return CONFIDENCE_LEVELS.VERY_LOW.label;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const total = this.stats.totalClassifications;
    return {
      ...this.stats,
      successRate: total > 0
        ? ((this.stats.llmSuccesses + this.stats.keywordFallbacks + this.stats.treeMatches) / total * 100).toFixed(1) + '%'
        : '0%',
      averageLatencyMs: this.stats.averageLatencyMs.toFixed(2)
    };
  }

  /**
   * 重置统计信息
   * @returns {TreeIntentClassifier}
   */
  resetStats() {
    this.stats = {
      totalClassifications: 0,
      llmSuccesses: 0,
      llmFailures: 0,
      keywordFallbacks: 0,
      clarifications: 0,
      treeMatches: 0,
      averageLatencyMs: 0
    };
    return this;
  }

  /**
   * 设置模型客户端
   * @param {Object} modelClient - 模型客户端
   * @returns {TreeIntentClassifier}
   */
  setModelClient(modelClient) {
    this.modelClient = modelClient;
    return this;
  }

  /**
   * 获取意图树结构（用于调试）
   * @returns {Object}
   */
  getIntentTreeStructure() {
    return this._nodeToObject(this.intentTree);
  }

  /**
   * 节点转对象（用于调试）
   * @private
   */
  _nodeToObject(node) {
    return {
      id: node.id,
      name: node.name,
      level: node.level,
      keywordsCount: node.keywords.length,
      childrenCount: node.children.length,
      children: node.children.map(child => this._nodeToObject(child))
    };
  }
}

// ==================== 兼容性别名 ====================

// 保留旧类名作为别名，兼容已有代码
const IntentClassifier = TreeIntentClassifier;

// ==================== 导出 ====================

module.exports = {
  // 主类
  TreeIntentClassifier,
  IntentClassifier,  // 兼容性别名

  // 层级枚举
  INTENT_LEVELS,

  // 兼容旧版意图类型
  INTENT_TYPES,
  TOOL_SUB_TYPES,
  TASK_SUB_TYPES,

  // 领域类型 (Level 1)
  DOMAIN_TYPES,

  // 类目类型 (Level 2)
  CATEGORY_TYPES,

  // 置信度等级
  CONFIDENCE_LEVELS,

  // 澄清阈值
  CLARIFICATION_THRESHOLDS,

  // 默认意图树
  DEFAULT_INTENT_TREE
};
