/**
 * QueryDecomposeService - 复杂问题拆分服务
 *
 * 企业级设计：
 * - 自动识别复杂多维度问题
 * - 将复杂问题拆分为多个可独立回答的子问题
 * - 支持串行依赖拆分（如"先...再..."）和平行可分拆分（如"...和..."）
 * - 支持子问题结果合并为完整答案
 *
 * 拆分策略：
 * - 纵向拆分：按步骤/时间顺序拆分（如"如何学习React" -> 安装/语法/状态/路由...）
 * - 横向拆分：按维度/方面拆分（如"比较A和B" -> A的特点/B的特点/对比分析）
 * - 混合拆分：同时包含纵向和横向（如"分析XX的优缺点及适用场景"）
 *
 * @example
 * const service = new QueryDecomposeService({ modelClient });
 * const subs = await service.decompose('比较React和Vue的优劣');
 * // subs: [{ q: 'React的特点和优势', dependOn: [] }, { q: 'Vue的特点和优势', dependOn: [] }, { q: '两者对比分析', dependOn: [0, 1] }]
 */

const { MiniMaxChatClient } = require('../../services/model/clients/MiniMaxChatClient');
const AppError = require('../../common/errors/AppError');

/**
 * 拆分类型枚举
 */
const DECOMPOSE_TYPES = {
  /** 纵向拆分：按步骤/时间顺序 */
  SEQUENTIAL: 'sequential',
  /** 横向拆分：按维度/方面并行 */
  PARALLEL: 'parallel',
  /** 混合拆分：纵向+横向 */
  HYBRID: 'hybrid',
};

/**
 * 子问题结构
 * @typedef {Object} SubQuestion
 * @property {string} id - 子问题唯一ID
 * @property {string} question - 子问题文本
 * @property {string} dimension - 所属维度
 * @property {number} order - 执行顺序
 * @property {string[]} dependOn - 依赖的子问题ID列表
 * @property {number} priority - 优先级（0-1）
 */

/**
 * 拆分结果结构
 * @typedef {Object} DecomposeResult
 * @property {SubQuestion[]} subQuestions - 子问题列表
 * @property {string} type - 拆分类型
 * @property {string} reasoning - 拆分理由
 * @property {number} confidence - 置信度
 * @property {boolean} shouldDecompose - 是否应该拆分
 */

class QueryDecomposeService {
  /**
   * @param {Object} options
   * @param {Object} options.modelClient - ChatModelClient 实例（可选）
   * @param {string} options.defaultModel - 默认模型（默认 MiniMax-M2.7）
   * @param {number} options.maxSubQuestions - 最大子问题数（默认 5）
   * @param {number} options.confidenceThreshold - 置信度阈值（默认 0.5）
   * @param {boolean} options.enableLLMDetect - 启用LLM判断是否拆分（默认 true）
   */
  constructor(options = {}) {
    // 模型客户端
    if (options.modelClient) {
      this.modelClient = options.modelClient;
    } else {
      this.modelClient = new MiniMaxChatClient({
        apiKey: options.apiKey || process.env.MINIMAX_API_KEY,
        baseUrl: options.baseUrl || process.env.MINIMAX_BASE_URL,
        defaultModel: options.defaultModel || 'MiniMax-M2.7',
      });
    }

    this.defaultModel = options.defaultModel || 'MiniMax-M2.7';
    this.maxSubQuestions = options.maxSubQuestions || 5;
    this.confidenceThreshold = options.confidenceThreshold || 0.5;
    this.enableLLMDetect = options.enableLLMDetect !== false;

    // 统计信息
    this.stats = {
      totalDecomposes: 0,
      successfulDecomposes: 0,
      skippedDecomposes: 0,
      failures: 0,
      averageSubQuestions: 0,
      averageLatencyMs: 0,
    };
  }

  /**
   * 主拆分接口
   * 判断是否需要拆分，如需要则返回子问题列表
   *
   * @param {string} complexQuery - 复杂查询
   * @param {Object} [context] - 上下文信息
   * @returns {Promise<DecomposeResult>}
   */
  async decompose(complexQuery, context = {}) {
    const startTime = Date.now();
    this.stats.totalDecomposes++;

    try {
      if (!complexQuery || complexQuery.trim() === '') {
        return {
          subQuestions: [],
          type: null,
          reasoning: '空查询无需拆分',
          confidence: 1.0,
          shouldDecompose: false,
        };
      }

      const trimmedQuery = complexQuery.trim();

      // 1. 判断是否需要拆分
      const shouldDecomposeResult = await this.canDecompose(trimmedQuery);

      if (!shouldDecomposeResult.shouldDecompose) {
        this.stats.skippedDecomposes++;
        return {
          subQuestions: [{
            id: 'q-0',
            question: trimmedQuery,
            dimension: 'main',
            order: 0,
            dependOn: [],
            priority: 1.0,
          }],
          type: null,
          reasoning: shouldDecomposeResult.reasoning,
          confidence: shouldDecomposeResult.confidence,
          shouldDecompose: false,
        };
      }

      // 2. 执行拆分
      const decomposition = await this._decomposeWithLLM(trimmedQuery, context);

      // 3. 后处理：验证和排序
      const validated = this._validateAndSort(decomposition);

      this.stats.successfulDecomposes++;
      this._updateLatency(startTime, validated.subQuestions.length);

      return {
        ...validated,
        shouldDecompose: true,
      };
    } catch (error) {
      this.stats.failures++;
      console.error('[QueryDecomposeService] Decompose error:', error);

      // 降级：返回原始查询作为单一子问题
      return {
        subQuestions: [{
          id: 'q-0',
          question: complexQuery,
          dimension: 'main',
          order: 0,
          dependOn: [],
          priority: 1.0,
        }],
        type: null,
        reasoning: '拆分失败，降级为单一问题',
        confidence: 0.3,
        shouldDecompose: false,
        error: error.message,
      };
    }
  }

  /**
   * 判断是否需要拆分
   *
   * @param {string} query - 用户查询
   * @returns {Promise<Object>} { shouldDecompose: boolean, reasoning: string, confidence: number, type?: string }
   */
  async canDecompose(query) {
    try {
      // 快速规则判断（关键词匹配）
      const quickResult = this._quickDetect(query);
      if (quickResult.shouldDecompose && quickResult.confidence > 0.8) {
        return quickResult;
      }

      // LLM 辅助判断
      if (this.enableLLMDetect) {
        return await this._llmDetect(query);
      }

      return quickResult;
    } catch (error) {
      console.warn('[QueryDecomposeService] canDecompose error:', error);
      return {
        shouldDecompose: false,
        reasoning: '检测过程异常，默认不拆分',
        confidence: 0.3,
      };
    }
  }

  /**
   * 合并子问题结果
   * 将多个子问题的答案合并为一个完整答案
   *
   * @param {SubQuestion[]} subQuestions - 子问题列表（包含答案）
   * @param {string} originalQuery - 原始问题
   * @param {Object} [options]
   * @param {boolean} [options.includeSource Attribution=true] - 是否包含来源标注
   * @returns {Promise<Object>} { mergedAnswer: string, sourceAttributions?: Object[] }
   */
  async mergeResults(subQuestions, originalQuery, options = {}) {
    const { includeSourceAttribution = true } = options;

    try {
      // 按依赖顺序排序
      const sorted = this._topologicalSort(subQuestions);

      // 构建答案摘要
      const answerSummary = sorted
        .filter(sq => sq.answer)
        .map(sq => `[子问题${sq.id}]: ${sq.question}\n回答: ${sq.answer}`)
        .join('\n\n');

      const prompt = `你是一个答案合并专家。请将多个子问题的回答合并为一个完整、连贯的答案。

## 原始问题
"${originalQuery}"

## 子问题及回答
${answerSummary}

## 合并要求
1. 保持原始问题的核心意图
2. 去除重复内容，整合相似观点
3. 按照逻辑顺序组织（先背景/定义，再分析，最后结论）
4. 如有矛盾观点，客观呈现并给出分析
5. 保持答案的完整性和专业性

${includeSourceAttribution ? '6. 在合适位置标注子问题来源（如"关于React的特点，..."）' : ''}

## 返回格式
{
  "merged_answer": "合并后的完整答案",
  "key_points": ["要点1", "要点2", ...],
  "conclusion": "最终结论（如有）"
}`;

      const response = await this.modelClient.chat({
        messages: [
          { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
          { role: 'user', content: prompt },
        ],
        model: this.defaultModel,
        options: {
          temperature: 0.5,
          max_tokens: 2000,
        },
      });

      const content = response.content?.[0]?.text || response.content || '';
      const parsed = this._parseJSONResponse(content);

      // 构建来源追溯
      let sourceAttributions = null;
      if (includeSourceAttribution) {
        sourceAttributions = sorted
          .filter(sq => sq.answer)
          .map(sq => ({
            subQuestionId: sq.id,
            question: sq.question,
            dimension: sq.dimension,
          }));
      }

      return {
        mergedAnswer: parsed.merged_answer || answerSummary,
        keyPoints: parsed.key_points || [],
        conclusion: parsed.conclusion || '',
        sourceAttributions,
      };
    } catch (error) {
      console.error('[QueryDecomposeService] Merge error:', error);

      // 降级：简单拼接
      const simpleMerge = subQuestions
        .filter(sq => sq.answer)
        .map(sq => sq.answer)
        .join('\n\n');

      return {
        mergedAnswer: simpleMerge || '无法合并结果',
        keyPoints: [],
        conclusion: '',
      };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 快速规则判断（关键词匹配）
   * @private
   */
  _quickDetect(query) {
    // 明显需要拆分的模式
    const decomposePatterns = [
      // 对比类
      { pattern: /比较|对比|差异|不同/, type: 'parallel', reason: '包含对比/比较意图', weight: 0.9 },
      // 并列类
      { pattern: /和.*和|以及.*和|既.*又/, type: 'parallel', reason: '包含多个并列项', weight: 0.85 },
      // 步骤类
      { pattern: /如何学会|怎么实现|步骤是|流程是/, type: 'sequential', reason: '包含多步骤请求', weight: 0.8 },
      // 原因+结果类
      { pattern: /为什么.*并且|原因.*结果/, type: 'hybrid', reason: '包含因果多维度', weight: 0.85 },
      // 优缺点类
      { pattern: /优缺点|利弊|优势.*劣势/, type: 'parallel', reason: '包含正反两面分析', weight: 0.9 },
      // 方面+分析类
      { pattern: /各个方面|多角度|从.*方面|从.*角度/, type: 'parallel', reason: '包含多维度请求', weight: 0.85 },
      // 未来+现在类
      { pattern: /现在.*未来|过去.*现在.*未来/, type: 'sequential', reason: '包含时间序列', weight: 0.8 },
    ];

    let bestMatch = null;
    let bestWeight = 0;

    for (const { pattern, type, reason, weight } of decomposePatterns) {
      if (pattern.test(query) && weight > bestWeight) {
        bestMatch = { type, reason };
        bestWeight = weight;
      }
    }

    // 查询长度辅助判断
    const isComplexLength = query.length > 30;

    if (bestMatch) {
      // 权重增强：长度也复杂时提高置信度
      const confidence = isComplexLength
        ? Math.min(bestWeight + 0.1, 0.95)
        : bestWeight;

      return {
        shouldDecompose: confidence >= this.confidenceThreshold,
        reasoning: bestMatch.reason,
        confidence,
        type: bestMatch.type,
      };
    }

    // 默认：短查询不拆分
    return {
      shouldDecompose: false,
      reasoning: isComplexLength ? '查询较复杂但未匹配明确拆分模式' : '查询较简单无需拆分',
      confidence: isComplexLength ? 0.4 : 0.2,
    };
  }

  /**
   * LLM 辅助判断是否拆分
   * @private
   */
  async _llmDetect(query) {
    const prompt = `你是一个复杂问题分析专家。请判断以下查询是否需要拆分为多个子问题。

## 查询
"${query}"

## 判断标准
需要拆分的情况：
1. 查询包含多个独立维度（如"React和Vue的区别"）
2. 查询包含步骤或流程（如"如何学习新技术"）
3. 查询需要多方面分析（如"分析AI对工作的影响"）
4. 查询是对比类（如"比较A和B的优劣"）
5. 查询包含并列意图（如"介绍一下Python和Java"）

不需要拆分的情况：
1. 查询是简单的单一问题（如"什么是AI"）
2. 查询意图明确且单一（如"怎么安装Node"）
3. 查询可以用一句话回答（如"JavaScript是谁发明的"）

## 返回格式
{
  "should_decompose": true/false,
  "reasoning": "判断理由（20字以内）",
  "decompose_type": "parallel/sequential/hybrid/null",
  "confidence": 0.0-1.0,
  "complexity_score": 1-10
}`;

    try {
      const response = await this.modelClient.chat({
        messages: [
          { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
          { role: 'user', content: prompt },
        ],
        model: this.defaultModel,
        options: {
          temperature: 0.3,
          max_tokens: 500,
        },
      });

      const content = response.content?.[0]?.text || response.content || '';
      const parsed = this._parseJSONResponse(content);

      return {
        shouldDecompose: parsed.should_decompose || false,
        reasoning: parsed.reasoning || 'LLM判断',
        confidence: parsed.confidence || 0.5,
        type: parsed.decompose_type || null,
      };
    } catch (error) {
      console.warn('[QueryDecomposeService] LLM detect failed, falling back to quick detect:', error.message);
      return this._quickDetect(query);
    }
  }

  /**
   * 使用 LLM 执行拆分
   * @private
   */
  async _decomposeWithLLM(query, context) {
    const prompt = `你是一个问题拆分专家。请将复杂查询拆分为多个可独立回答的子问题。

## 复杂查询
"${query}"

## 拆分要求
1. 拆分为 ${this.maxSubQuestions} 个以内的子问题
2. 每个子问题应该：
   - 单一维度/方面
   - 可以独立回答
   - 表达清晰无歧义
3. 明确子问题之间的依赖关系
4. 标注每个子问题的优先级

## 拆分类型说明
- parallel（横向）：子问题之间是并列关系，可并行回答
- sequential（纵向）：子问题之间有先后顺序依赖
- hybrid（混合）：既有并行也有顺序

## 返回格式
{
  "decompose_type": "parallel/sequential/hybrid",
  "reasoning": "拆分策略的理由（30字以内）",
  "confidence": 0.0-1.0,
  "sub_questions": [
    {
      "question": "子问题1",
      "dimension": "维度名称（如：特点/价格/性能）",
      "order": 0,
      "depend_on": ["依赖的子问题id数组，无依赖则空数组"],
      "priority": 0.0-1.0
    },
    ...
  ]
}`;

    const response = await this.modelClient.chat({
      messages: [
        { role: 'system', content: '你是一个JSON生成助手，只返回有效的JSON，不要其他内容。' },
        { role: 'user', content: prompt },
      ],
      model: this.defaultModel,
      options: {
        temperature: 0.5,
        max_tokens: 1500,
      },
    });

    const content = response.content?.[0]?.text || response.content || '';
    const parsed = this._parseJSONResponse(content);

    return {
      type: parsed.decompose_type || 'parallel',
      reasoning: parsed.reasoning || 'LLM智能拆分',
      confidence: parsed.confidence || 0.6,
      subQuestions: (parsed.sub_questions || []).map((sq, index) => ({
        id: `q-${index}`,
        question: sq.question,
        dimension: sq.dimension || 'main',
        order: sq.order ?? index,
        dependOn: sq.depend_on || [],
        priority: sq.priority ?? (1 - index * 0.1),
      })),
    };
  }

  /**
   * 验证和排序子问题
   * @private
   */
  _validateAndSort(decomposition) {
    let { subQuestions, type, reasoning, confidence } = decomposition;

    // 限制数量
    if (subQuestions.length > this.maxSubQuestions) {
      subQuestions = subQuestions
        .sort((a, b) => b.priority - a.priority)
        .slice(0, this.maxSubQuestions);
    }

    // 重新编号
    subQuestions = subQuestions.map((sq, index) => ({
      ...sq,
      id: `q-${index}`,
      order: sq.order ?? index,
    }));

    // 处理依赖关系
    const idMap = new Map(subQuestions.map((sq, i) => [sq.question.substring(0, 30), sq.id]));
    subQuestions = subQuestions.map(sq => {
      // 清理依赖引用（如果原引用是基于问题的，使用索引映射）
      const validDeps = sq.dependOn
        .map(dep => {
          if (typeof dep === 'number' && dep < subQuestions.length) {
            return `q-${dep}`;
          }
          if (typeof dep === 'string' && idMap.has(dep.substring(0, 30))) {
            return idMap.get(dep.substring(0, 30));
          }
          return dep;
        })
        .filter(dep => subQuestions.some(s => s.id === dep));

      return { ...sq, dependOn: validDeps };
    });

    // 如果是串行类型，按依赖关系拓扑排序
    if (type === 'sequential' || type === 'hybrid') {
      subQuestions = this._topologicalSort(subQuestions);
    }

    return {
      subQuestions,
      type,
      reasoning,
      confidence,
    };
  }

  /**
   * 拓扑排序（根据依赖关系排序）
   * @private
   */
  _topologicalSort(subQuestions) {
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (sq) => {
      if (visited.has(sq.id)) return;
      if (visiting.has(sq.id)) {
        // 循环依赖：放在当前顺序
        console.warn('[QueryDecomposeService] Circular dependency detected:', sq.id);
        return;
      }

      visiting.add(sq.id);

      // 先访问依赖
      for (const depId of sq.dependOn) {
        const dep = subQuestions.find(s => s.id === depId);
        if (dep) visit(dep);
      }

      visiting.delete(sq.id);
      visited.add(sq.id);
      sorted.push(sq);
    };

    for (const sq of subQuestions) {
      visit(sq);
    }

    // 未排序的追加到末尾
    for (const sq of subQuestions) {
      if (!visited.has(sq.id)) {
        sorted.push(sq);
      }
    }

    // 重新编号
    return sorted.map((sq, index) => ({ ...sq, order: index }));
  }

  /**
   * 更新延迟统计
   * @private
   */
  _updateLatency(startTime, subQuestionCount = 0) {
    const latency = Date.now() - startTime;
    const total = this.stats.totalDecomposes;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (total - 1) + latency) / total;
    this.stats.averageSubQuestions =
      (this.stats.averageSubQuestions * (total - 1) + subQuestionCount) / total;
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
        throw new AppError('BIZ_INVALID_INPUT', '无法解析LLM响应', { response: response.substring(0, 200) });
      }
    }
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalDecomposes > 0
        ? ((this.stats.successfulDecomposes + this.stats.skippedDecomposes) / this.stats.totalDecomposes * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalDecomposes: 0,
      successfulDecomposes: 0,
      skippedDecomposes: 0,
      failures: 0,
      averageSubQuestions: 0,
      averageLatencyMs: 0,
    };
    return this;
  }
}

module.exports = {
  QueryDecomposeService,
  DECOMPOSE_TYPES,
};
