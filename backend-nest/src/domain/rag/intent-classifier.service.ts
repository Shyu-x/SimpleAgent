import { Injectable } from '@nestjs/common';

/**
 * 意图层级枚举
 */
export enum IntentLevel {
  DOMAIN = 1,
  CATEGORY = 2,
  TOPIC = 3,
}

/**
 * 领域类型枚举
 */
export enum DomainType {
  TECHNOLOGY_CONSULT = 'technology_consult',
  CODE_DEVELOPMENT = 'code_development',
  DATA_ANALYSIS = 'data_analysis',
  DAILY_COMMUNICATION = 'daily_communication',
  CREATIVE_GENERATION = 'creative_generation',
  TOOL_OPERATION = 'tool_operation',
}

/**
 * 兼容旧版意图类型
 */
export enum IntentType {
  KNOWLEDGE_QA = 'knowledge_qa',
  TOOL_USE = 'tool_use',
  TASK_EXECUTION = 'task_execution',
  CASUAL_CHAT = 'casual_chat',
  COMPLEX = 'complex',
}

/**
 * 类目类型枚举
 */
export enum CategoryType {
  PROGRAMMING_LANGUAGE = 'programming_language',
  FRAMEWORK = 'framework',
  LIBRARY = 'library',
  SYSTEM_ARCHITECTURE = 'system_architecture',
  ALGORITHM = 'algorithm',
  CONCEPT = 'concept',
  CODE_WRITE = 'code_write',
  CODE_DEBUG = 'code_debug',
  CODE_REVIEW = 'code_review',
  REFACTOR = 'refactor',
  SUMMARY = 'summary',
  DATA_PROCESS = 'data_process',
  VISUALIZATION = 'visualization',
  STATISTICS = 'statistics',
  CASUAL_CHAT = 'casual_chat',
  QUESTION_ANSWER = 'question_answer',
  IMAGE_GENERATION = 'image_generation',
  TEXT_GENERATION = 'text_generation',
  WEB_SEARCH = 'web_search',
  FILE_OPERATION = 'file_operation',
  API_CALL = 'api_call',
}

/**
 * 置信度等级
 */
export const CONFIDENCE_LEVELS = {
  HIGH: { min: 0.8, label: '高置信度' },
  MEDIUM: { min: 0.5, label: '中等置信度' },
  LOW: { min: 0.3, label: '低置信度' },
  VERY_LOW: { min: 0, label: '极低置信度' },
};

/**
 * 澄清阈值配置
 */
export const CLARIFICATION_THRESHOLDS = {
  DOMAIN_MIN: 0.3,
  CATEGORY_MIN: 0.25,
  TOPIC_MIN: 0.2,
  FINAL_MIN: 0.2,
};

/**
 * 意图树节点接口
 */
export interface IntentTreeNode {
  id: string;
  name: string;
  level: number;
  keywords: string[];
  children: IntentTreeNode[];
}

/**
 * 意图分类结果接口
 */
export interface IntentClassificationResult {
  intent: string;
  domain: string;
  category?: string;
  topic?: string;
  confidence: number;
  domainConfidence: number;
  categoryConfidence: number;
  topicConfidence: number;
  clarification?: string;
  needsClarification: boolean;
  source: string;
  reasoning: string;
  treePath?: {
    domain: { id: string; name: string } | null;
    category: { id: string; name: string } | null;
    topic: { id: string; name: string } | null;
    matchedKeywords: string[];
  };
}

/**
 * 默认意图树配置
 */
const DEFAULT_INTENT_TREE: IntentTreeNode = {
  id: 'root',
  name: '根节点',
  level: 0,
  keywords: [],
  children: [
    {
      id: DomainType.TECHNOLOGY_CONSULT,
      name: '技术咨询',
      level: IntentLevel.DOMAIN,
      keywords: ['什么是', '是什么', '什么意思', '介绍', '讲解', '解释', '原理', '为什么', '如何', '怎么'],
      children: [
        { id: CategoryType.CONCEPT, name: '概念解释', level: IntentLevel.CATEGORY, keywords: ['什么叫', '定义', '概念'], children: [] },
        { id: CategoryType.PROGRAMMING_LANGUAGE, name: '编程语言', level: IntentLevel.CATEGORY, keywords: ['Python', 'JavaScript', 'Java', 'Go'], children: [] },
        { id: CategoryType.FRAMEWORK, name: '框架', level: IntentLevel.CATEGORY, keywords: ['React', 'Vue', 'Node.js', 'Django'], children: [] },
      ],
    },
    {
      id: DomainType.CODE_DEVELOPMENT,
      name: '代码开发',
      level: IntentLevel.DOMAIN,
      keywords: ['写', '写代码', '编程', '代码', '调试', 'debug', '审查'],
      children: [
        { id: CategoryType.CODE_WRITE, name: '编写代码', level: IntentLevel.CATEGORY, keywords: ['写', '创建', '实现'], children: [] },
        { id: CategoryType.CODE_DEBUG, name: '调试代码', level: IntentLevel.CATEGORY, keywords: ['调试', 'debug', '错误', '修复'], children: [] },
      ],
    },
    {
      id: DomainType.DAILY_COMMUNICATION,
      name: '日常交流',
      level: IntentLevel.DOMAIN,
      keywords: ['你好', '嗨', '在吗', '谢谢'],
      children: [
        { id: CategoryType.CASUAL_CHAT, name: '闲聊', level: IntentLevel.CATEGORY, keywords: ['吗', '呢', '啊'], children: [] },
        { id: CategoryType.QUESTION_ANSWER, name: '问答', level: IntentLevel.CATEGORY, keywords: ['问', '答', '问题'], children: [] },
      ],
    },
    {
      id: DomainType.TOOL_OPERATION,
      name: '工具操作',
      level: IntentLevel.DOMAIN,
      keywords: ['搜索', '计算', '翻译', '生成', '获取'],
      children: [
        { id: CategoryType.WEB_SEARCH, name: '网页搜索', level: IntentLevel.CATEGORY, keywords: ['搜索', '查找'], children: [] },
        { id: CategoryType.FILE_OPERATION, name: '文件操作', level: IntentLevel.CATEGORY, keywords: ['读取', '写入', '保存'], children: [] },
      ],
    },
  ],
};

/**
 * 意图树节点类
 */
class IntentNode {
  id: string;
  name: string;
  level: number;
  keywords: string[];
  children: IntentNode[];
  confidence = 0;
  matchedKeywords: string[] = [];

  constructor(config: IntentTreeNode) {
    this.id = config.id;
    this.name = config.name;
    this.level = config.level || 0;
    this.keywords = config.keywords || [];
    this.children = config.children.map((child) => new IntentNode(child));
  }

  calculateMatchScore(query: string): number {
    const queryLower = query.toLowerCase();
    let score = 0;
    this.matchedKeywords = [];

    for (const keyword of this.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (queryLower.includes(keywordLower)) {
        const weight = keyword.length * 1.5;
        score += weight;
        this.matchedKeywords.push(keyword);
      }
    }

    return score;
  }

  isLeaf(): boolean {
    return this.children.length === 0;
  }
}

/**
 * 树形意图分类服务
 * 实现三级树形意图分类：领域 -> 类目 -> 话题
 */
@Injectable()
export class IntentClassifierService {
  private intentTree: IntentNode;
  private thresholds = {
    domain: CLARIFICATION_THRESHOLDS.DOMAIN_MIN,
    category: CLARIFICATION_THRESHOLDS.CATEGORY_MIN,
    topic: CLARIFICATION_THRESHOLDS.TOPIC_MIN,
    final: CLARIFICATION_THRESHOLDS.FINAL_MIN,
  };

  private stats = {
    totalClassifications: 0,
    treeMatches: 0,
    clarifications: 0,
    averageLatencyMs: 0,
  };

  constructor() {
    this.intentTree = new IntentNode(DEFAULT_INTENT_TREE);
  }

  /**
   * 主分类接口
   */
  async classify(query: string, context: any = {}): Promise<IntentClassificationResult> {
    const startTime = Date.now();
    this.stats.totalClassifications++;

    try {
      if (!query || query.trim() === '') {
        return this.buildResult(DomainType.DAILY_COMMUNICATION, null, null, 0.4, 'empty_query', '空查询');
      }

      const trimmedQuery = query.trim();

      // 1. 树形结构匹配
      const treeResult = this.classifyWithTree(trimmedQuery);
      this.stats.treeMatches++;

      // 低置信度需要澄清
      if (treeResult.confidence < CONFIDENCE_LEVELS.HIGH.min) {
        this.stats.clarifications++;
        return this.addClarification(treeResult, trimmedQuery);
      }

      return treeResult;
    } finally {
      this.stats.averageLatencyMs = (this.stats.averageLatencyMs * (this.stats.totalClassifications - 1) + (Date.now() - startTime)) / this.stats.totalClassifications;
    }
  }

  /**
   * 使用树形结构进行意图分类
   */
  private classifyWithTree(query: string): IntentClassificationResult {
    const root = this.intentTree;
    let bestDomain: IntentNode | null = null;
    let bestCategory: IntentNode | null = null;
    let bestTopic: IntentNode | null = null;
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

    if (bestDomain && bestDomainScore > 0) {
      domainConfidence = Math.min(0.3 + (bestDomainScore / 50) * 0.5, 0.95);
    } else {
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

      if (bestCategory && bestCategoryScore > 0) {
        categoryConfidence = Math.min(0.25 + (bestCategoryScore / 30) * 0.45, 0.9);
      } else {
        categoryConfidence = domainConfidence * 0.7;
      }
    }

    // 计算最终置信度
    let finalConfidence = domainConfidence * 0.5;
    if (categoryConfidence > 0) {
      finalConfidence += categoryConfidence * 0.35;
    } else {
      finalConfidence = domainConfidence * 0.85;
    }

    if (topicConfidence > 0) {
      finalConfidence += topicConfidence * 0.15;
    }

    finalConfidence = Math.min(finalConfidence, 0.95);

    return this.buildResult(
      bestDomain ? bestDomain.id : DomainType.DAILY_COMMUNICATION,
      bestCategory ? bestCategory.id : null,
      (bestTopic as any)?.id || null,
      finalConfidence,
      'tree',
      `树形匹配: ${bestDomain?.name || '未匹配'} -> ${bestCategory?.name || '未匹配'}`,
      { domainConfidence, categoryConfidence, topicConfidence },
    );
  }

  /**
   * 构建分类结果
   */
  private buildResult(
    intent: string,
    category: string | null,
    topic: string | null,
    confidence: number,
    source: string,
    reasoning: string,
    levelConfidences: { domainConfidence: number; categoryConfidence: number; topicConfidence: number } = {
      domainConfidence: confidence,
      categoryConfidence: 0,
      topicConfidence: 0,
    },
  ): IntentClassificationResult {
    return {
      intent,
      domain: intent,
      category: category || undefined,
      topic: topic || undefined,
      confidence,
      domainConfidence: levelConfidences.domainConfidence,
      categoryConfidence: levelConfidences.categoryConfidence,
      topicConfidence: levelConfidences.topicConfidence,
      needsClarification: false,
      source,
      reasoning,
    };
  }

  /**
   * 添加澄清问题
   */
  private addClarification(result: IntentClassificationResult, query: string): IntentClassificationResult {
    const templates: Record<string, string[]> = {
      [DomainType.TECHNOLOGY_CONSULT]: ['您是想了解这个概念的定义，还是想学习相关教程？'],
      [DomainType.CODE_DEVELOPMENT]: ['您希望我帮您完成什么任务？'],
      [DomainType.DAILY_COMMUNICATION]: ['有什么我可以帮您的？'],
      [DomainType.TOOL_OPERATION]: ['您需要我帮您执行什么操作？'],
    };

    const options = templates[result.domain] || templates[DomainType.DAILY_COMMUNICATION];
    const clarificationQuestion = options[Math.floor(Math.random() * options.length)];

    return {
      ...result,
      clarification: clarificationQuestion,
      needsClarification: true,
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalClassifications > 0
          ? ((this.stats.treeMatches + this.stats.clarifications) / this.stats.totalClassifications * 100).toFixed(1) + '%'
          : '0%',
    };
  }
}
