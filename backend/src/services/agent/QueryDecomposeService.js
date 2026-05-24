/**
 * 查询拆分服务 (QueryDecomposeService)
 * 将复杂问题拆分为可并行/串行执行的子问题
 *
 * 功能:
 * 1. 识别复杂问题（多条件、多步骤）
 * 2. 拆分为独立子问题列表
 * 3. 子问题带依赖关系
 * 4. 支持串行和并行执行计划
 */

class QueryDecomposeService {
  constructor(options = {}) {
    this.maxSubQueries = options.maxSubQueries || 10;
    this.enableDependencyAnalysis = options.enableDependencyAnalysis !== false;
    this.parallelKeywords = options.parallelKeywords || [
      '和', '与', '以及', '同时', '并且', '对比', '比较', '或者', '还是'
    ];
    this.serialKeywords = options.serialKeywords || [
      '首先', '然后', '接着', '其次', '最后', '最终', '之后', '下一步', '接下来'
    ];
    this.depIndicatorKeywords = options.depIndicatorKeywords || [
      '用', '根据', '基于', '依赖', '通过', '借助', '因为', '由于'
    ];
  }

  /**
   * 拆分查询
   * @param {string} query - 原始查询
   * @param {Object} context - 上下文信息
   * @returns {Object} { subQueries: [{id, query, dependencies, parallel}], plan: 'serial'|'parallel' }
   */
  async decompose(query, context = {}) {
    // 1. 检测查询复杂度
    const complexity = this.analyzeComplexity(query);

    // 2. 确定执行计划
    const plan = this.determinePlan(query, complexity);

    // 3. 拆分子问题
    const subQueries = this.extractSubQueries(query, plan, context);

    // 4. 分析依赖关系
    if (this.enableDependencyAnalysis) {
      this.analyzeDependencies(subQueries, context);
    }

    return {
      subQueries,
      plan,
      complexity,
      originalQuery: query
    };
  }

  /**
   * 分析查询复杂度
   */
  analyzeComplexity(query) {
    // 统计问号数量（包括中英文）
    const questionCount = (query.match(/[？?]/g) || []).length;
    // 检查是否包含疑问词（用于识别隐式问题，如"什么是机器学习"）
    const hasQuestionWords = /^(什么|如何|怎么|为什么|请问|能否|能不能|是否)/.test(query.trim());
    // 如果没有问号但有疑问词，则视为一个问题
    const effectiveQuestionCount = questionCount > 0 ? questionCount : (hasQuestionWords ? 1 : 0);
    // 检查比较类关键词
    const hasComparison = /对比|比较|差异|不同|区别/i.test(query);
    const hasMultipleSteps = /首先|然后|接着|最后/i.test(query);
    const hasParallelParts = /和|与|以及|并且|同时|或者/.test(query);
    const hasConditional = /如果|当|条件|假设/i.test(query);
    const length = query.length;

    // 计算复杂度得分
    let score = 0;
    if (effectiveQuestionCount > 1) score += 2;
    if (effectiveQuestionCount === 1) score += 1; // 单问题给1分
    if (hasComparison) score += 3; // 比较类问题权重更高
    if (hasMultipleSteps) score += 2;
    if (hasParallelParts) score += 1;
    if (hasConditional) score += 1;
    if (length > 100) score += 1;
    if (length > 200) score += 1;

    let level = 'simple';
    if (score >= 5) level = 'complex';
    else if (score >= 3) level = 'moderate';

    return {
      score,
      level,
      questionCount: effectiveQuestionCount,
      hasComparison,
      hasMultipleSteps,
      hasParallelParts,
      hasConditional,
      length
    };
  }

  /**
   * 确定执行计划
   */
  determinePlan(query, complexity) {
    // 有多步骤关键词 -> 串行
    const hasSerialKeywords = this.serialKeywords.some(kw => query.includes(kw));
    if (hasSerialKeywords) {
      return 'serial';
    }

    // 有对比类 -> 通常可并行（分别查）
    if (complexity.hasComparison && complexity.hasParallelParts) {
      return 'parallel';
    }

    // 多问题但无依赖 -> 并行
    if (complexity.questionCount > 1 && !complexity.hasMultipleSteps) {
      return 'parallel';
    }

    // 复杂多步骤 -> 串行
    if (complexity.level === 'complex' && complexity.hasMultipleSteps) {
      return 'serial';
    }

    // 默认尝试并行
    return complexity.level === 'simple' ? 'parallel' : 'serial';
  }

  /**
   * 提取子问题
   */
  extractSubQueries(query, plan, context) {
    const subQueries = [];
    let idCounter = 1;

    // 按句子拆分
    const sentences = this.splitBySentences(query);

    if (sentences.length > 1) {
      // 按句子拆分
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed && !this.isFiller(trimmed)) {
          subQueries.push(this.createSubQuery(idCounter++, trimmed, plan));
        }
      }
    } else {
      // 按连接词拆分
      const parts = this.splitByConnectors(query);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed && !this.isFiller(trimmed)) {
          subQueries.push(this.createSubQuery(idCounter++, trimmed, plan));
        }
      }
    }

    // 检查是否需要合并（避免过多子查询）
    if (subQueries.length > this.maxSubQueries) {
      return this.mergeSubQueries(subQueries);
    }

    return subQueries;
  }

  /**
   * 创建子问题对象
   */
  createSubQuery(id, query, plan) {
    return {
      id: `sq_${id}`,
      query,
      dependencies: [],
      parallel: plan === 'parallel',
      type: this.classifySubQuery(query)
    };
  }

  /**
   * 分类子问题类型
   */
  classifySubQuery(query) {
    if (/搜索|查询|查找|获取|什么是|如何|怎么/i.test(query)) {
      return 'search';
    }
    if (/比较|对比|差异|不同/i.test(query)) {
      return 'comparison';
    }
    if (/总结|汇总|概括|概述/i.test(query)) {
      return 'summary';
    }
    if (/分析|解析|研究|探讨/i.test(query)) {
      return 'analysis';
    }
    if (/生成|创建|制作/i.test(query)) {
      return 'generation';
    }
    return 'general';
  }

  /**
   * 按句子拆分
   */
  splitBySentences(query) {
    return query
      .split(/[。；!?！？\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * 按连接词拆分
   */
  splitByConnectors(query) {
    // 优先级：串行关键词 > 并行关键词
    const serialSeparators = this.serialKeywords.filter(kw => query.includes(kw));
    const parallelSeparators = this.parallelKeywords.filter(kw => query.includes(kw));

    // 优先按串行词拆分（使用所有找到的串行关键词进行拆分）
    if (serialSeparators.length > 0) {
      // 按所有串行关键词拆分
      const serialPattern = serialSeparators.join('|');
      const parts = query.split(new RegExp(`(${serialPattern})`)).filter(p => p.trim());
      if (parts.length > 1) {
        return this.rebuildWithSerial(parts, serialSeparators);
      }
    }

    // 按并行词拆分
    if (parallelSeparators.length > 0) {
      const sep = parallelSeparators[0];
      const parts = query.split(sep).filter(p => p.trim());
      if (parts.length > 1) {
        return parts;
      }
    }

    return [query];
  }

  /**
   * 重建串行顺序的子查询
   */
  rebuildWithSerial(parts, separator) {
    // 找出"首先"、"然后"等词的位置，重新排序
    const ordered = [];
    const remaining = [];

    for (const part of parts) {
      let inserted = false;
      for (const serialKw of this.serialKeywords) {
        if (part.includes(serialKw)) {
          ordered.push({ part, order: this.serialKeywords.indexOf(serialKw) });
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        remaining.push(part);
      }
    }

    ordered.sort((a, b) => a.order - b.order);
    return [...ordered.map(o => o.part), ...remaining];
  }

  /**
   * 判断是否为填充词
   */
  isFiller(text) {
    const fillers = ['好的', '请问', '我想', '帮我', '可以'];
    return fillers.some(f => text === f || text.startsWith(f + '，'));
  }

  /**
   * 分析子问题间的依赖关系
   */
  analyzeDependencies(subQueries, context = {}) {
    for (let i = 0; i < subQueries.length; i++) {
      const current = subQueries[i];

      // 检查当前子查询是否依赖前面的结果
      for (let j = 0; j < i; j++) {
        const previous = subQueries[j];

        // 方法1: 检查指代词
        if (this.hasReference(current.query, previous.query)) {
          current.dependencies.push(previous.id);
          continue;
        }

        // 方法2: 检查依赖关键词
        if (this.hasDepIndicator(current.query, previous.query)) {
          current.dependencies.push(previous.id);
          continue;
        }

        // 方法3: 检查类型依赖（summary 依赖 search/comparison）
        if (current.type === 'summary' &&
            (previous.type === 'search' || previous.type === 'comparison')) {
          current.dependencies.push(previous.id);
        }
      }
    }

    // 更新并行属性（如果有依赖则改为串行）
    for (const sq of subQueries) {
      if (sq.dependencies.length > 0) {
        sq.parallel = false;
      }
    }
  }

  /**
   * 检查是否有指代关系
   */
  hasReference(currentQuery, previousQuery) {
    const references = [
      '它', '他', '她', '这个', '那个', '这些', '那些',
      '该', '上述', '前文', '上面', '之前', '刚才', '以上'
    ];

    for (const ref of references) {
      if (currentQuery.includes(ref)) {
        // 提取指代内容匹配前面的查询
        return true;
      }
    }

    // 检查名词重叠
    const prevNouns = this.extractNouns(previousQuery);
    for (const noun of prevNouns) {
      if (currentQuery.includes(noun) && noun.length >= 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否有依赖指示词
   */
  hasDepIndicator(currentQuery, previousQuery) {
    const prevNouns = this.extractNouns(previousQuery);

    // 方法1: 检查依赖关键词 + 名词匹配
    for (const kw of this.depIndicatorKeywords) {
      if (currentQuery.includes(kw)) {
        // 检查是否涉及前面的内容（精确匹配或部分匹配）
        for (const noun of prevNouns) {
          if (currentQuery.includes(noun) && noun.length >= 2) {
            return true;
          }
          // 也检查部分匹配：提取名词中的关键概念
          for (const prevNoun of prevNouns) {
            // 检查前一个词的核心概念是否出现在当前查询中
            const coreWords = prevNoun.split(/(?:分析|处理|总结|比较|查询)/).filter(w => w.length >= 2);
            for (const word of coreWords) {
              if (currentQuery.includes(word) && word.length >= 2) {
                return true;
              }
            }
          }
        }
      }
    }

    // 方法2: 检查"用...结果"模式（独立检查，不依赖depIndicatorKeywords）
    const resultPattern = /结果|答案|内容|信息|数据/i;
    if (resultPattern.test(currentQuery)) {
      for (const noun of prevNouns) {
        if (currentQuery.includes(noun) && noun.length >= 2) {
          return true;
        }
        // 额外检查：数据、分析等核心词
        const keywords = ['分析', '处理', '数据', '结果', '比较'];
        for (const kw of keywords) {
          if (currentQuery.includes(kw) && previousQuery.includes(kw)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 提取名词（简单实现）
   */
  extractNouns(text) {
    // 排除常见动词和形容词（作为完整词）
    const stopWords = [
      '什么', '如何', '怎么', '为什么', '查询', '搜索', '获取',
      '比较', '对比', '总结', '分析', '知道', '了解', '查看'
    ];

    // 按标点和空格分割，同时保留复合词
    const words = text.split(/[，、。！？""''（）()\s]/);
    return words.filter(w => {
      if (w.length < 2) return false;
      // 排除完整匹配停用词的词
      if (stopWords.includes(w)) return false;
      // 复合词（4+字符）通常是有意义的名词短语，保留
      if (w.length >= 4) return true;
      // 短词（2-3字符）如果以停用词开头则过滤
      if (stopWords.some(sw => w.startsWith(sw))) return false;
      return true;
    });
  }

  /**
   * 合并子查询（避免过多）
   */
  mergeSubQueries(subQueries) {
    // 简单合并策略：相邻合并
    const merged = [];
    for (let i = 0; i < subQueries.length; i += 2) {
      if (i + 1 < subQueries.length) {
        merged.push({
          ...subQueries[i],
          query: `${subQueries[i].query}，${subQueries[i + 1].query}`,
          id: `sq_merged_${Math.floor(i / 2)}`
        });
      } else {
        merged.push(subQueries[i]);
      }
    }
    return merged;
  }

  /**
   * 生成执行计划描述
   */
  describePlan(result) {
    const { subQueries, plan, complexity } = result;

    const lines = [];
    lines.push(`执行计划: ${plan === 'parallel' ? '并行' : '串行'}`);
    lines.push(`复杂度: ${complexity.level} (得分: ${complexity.score})`);
    lines.push(`子问题数量: ${subQueries.length}`);
    lines.push('');

    for (const sq of subQueries) {
      const deps = sq.dependencies.length > 0 ? ` [依赖: ${sq.dependencies.join(', ')}]` : '';
      const parallelMark = sq.parallel ? '(并行)' : '(串行)';
      lines.push(`${sq.id}${parallelMark}${deps}: ${sq.query}`);
    }

    return lines.join('\n');
  }
}

module.exports = { QueryDecomposeService };
