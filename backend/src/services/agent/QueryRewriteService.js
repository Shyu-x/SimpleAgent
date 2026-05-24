/**
 * 查询重写服务 (QueryRewriteService)
 * 企业级查询优化：上下文补全、缩写展开、口语规范化、共指消解
 *
 * 功能：
 * 1. 上下文补全：根据对话历史补充省略的主语/宾语
 * 2. 缩写展开：如"LLM" → "Large Language Model"
 * 3. 口语规范化：如"多少钱" → "产品价格是多少"
 * 4. 共指消解：如"它" → 指代的前文实体
 */

class QueryRewriteService {
  constructor(options = {}) {
    // 上下文窗口大小（保留最近N条消息）
    this.contextWindow = options.contextWindow || 10;

    // 最大补全迭代次数（防止无限循环）
    this.maxRewriteIterations = options.maxRewriteIterations || 3;

    // 是否启用各功能模块
    this.enableContextCompletion = options.enableContextCompletion !== false;
    this.enableAbbreviationExpansion = options.enableAbbreviationExpansion !== false;
    this.enableColloquialNormalization = options.enableColloquialNormalization !== false;
    this.enableCoreferenceResolution = options.enableCoreferenceResolution !== false;

    // 预编译正则表达式，提高效率
    this._compiledPatterns = {
      quoted: /"([^"]+)"/g,
      isPattern: /([^，,。\n]+)是一个?([^，,。\n]+)/g,
      isOfPattern: /([^，,。\n]+)是的?([^，]*的[^，,。\n]+)/g,
      aboutPattern: /关于([^，,。\n]+)/g,
      corefRegex: /它|他|她|他们|她们|它们|这个|那个|这些|那些|之前|之后|刚才|现在|目前|这次|那次|上次的|之前的|这事|那事|这个问题|那个问题|这项|那项/g
    };

    // 缩写词典（可扩展）
    this.abbreviationDict = {
      // 技术术语
      'LLM': 'Large Language Model',
      'NLP': 'Natural Language Processing',
      'ML': 'Machine Learning',
      'DL': 'Deep Learning',
      'AI': 'Artificial Intelligence',
      'AGI': 'Artificial General Intelligence',
      'API': 'Application Programming Interface',
      'SDK': 'Software Development Kit',
      'GUI': 'Graphical User Interface',
      'CLI': 'Command Line Interface',
      'URL': 'Uniform Resource Locator',
      'HTTP': 'HyperText Transfer Protocol',
      'HTTPS': 'HyperText Transfer Protocol Secure',
      'TCP': 'Transmission Control Protocol',
      'UDP': 'User Datagram Protocol',
      'DNS': 'Domain Name System',
      'SQL': 'Structured Query Language',
      'NoSQL': 'Non-Relational Database',
      'ORM': 'Object-Relational Mapping',
      'REST': 'Representational State Transfer',
      'GraphQL': 'Graph Query Language',
      'JSON': 'JavaScript Object Notation',
      'XML': 'Extensible Markup Language',
      'HTML': 'HyperText Markup Language',
      'CSS': 'Cascading Style Sheets',
      'JS': 'JavaScript',
      'TS': 'TypeScript',
      'AWS': 'Amazon Web Services',
      'GCP': 'Google Cloud Platform',
      'Azure': 'Microsoft Azure',
      'K8s': 'Kubernetes',
      'CI': 'Continuous Integration',
      'CD': 'Continuous Deployment',
      'DevOps': 'Development Operations',
      'TDD': 'Test-Driven Development',
      'BDD': 'Behavior-Driven Development',

      // 业务术语
      'CRM': 'Customer Relationship Management',
      'ERP': 'Enterprise Resource Planning',
      'SaaS': 'Software as a Service',
      'PaaS': 'Platform as a Service',
      'IaaS': 'Infrastructure as a Service',
      'B2B': 'Business to Business',
      'B2C': 'Business to Consumer',
      'O2O': 'Online to Offline',
      'MVP': 'Minimum Viable Product',
      'KPI': 'Key Performance Indicator',
      'OKR': 'Objectives and Key Results',
      'ROI': 'Return on Investment',
      'CAC': 'Customer Acquisition Cost',
      'LTV': 'Lifetime Value',
      'MRR': 'Monthly Recurring Revenue',
      'ARR': 'Annual Recurring Revenue',

      // 项目管理
      'PM': 'Product Manager / Project Manager',
      'UI': 'User Interface',
      'UX': 'User Experience',
      'PRD': 'Product Requirements Document',
      'MRD': 'Market Requirements Document',
      'SRS': 'Software Requirements Specification',
      'SDD': 'Software Design Document',

      // 常见缩写
      'ASAP': 'as soon as possible',
      'ETA': 'Estimated Time of Arrival',
      'FYI': 'For Your Information',
      'FAQ': 'Frequently Asked Questions',
      'TBD': 'to be determined',
      'TBA': 'to be announced',
      'WIP': 'work in progress',
      'TODO': 'to do',
      'BUG': 'software defect',

      // 中文语境缩写
      '人机': '人机交互',
      '机翻': '机器翻译',
      '智算': '智能计算',
    };

    // 口语化表达映射（中文）
    this.colloquialPatterns = [
      // 价格相关
      { pattern: /多少钱|价格多少|怎么卖|好多钱|几多钱/, replacement: '价格是多少', type: 'price_inquiry' },
      { pattern: /贵不贵|便宜吗|实惠吗|划算吗/, replacement: '价格是否合理', type: 'price_evaluation' },
      { pattern: /打折|优惠|促销|特价|降价/, replacement: '是否有折扣', type: 'discount_inquiry' },

      // 质量相关
      { pattern: /好不好|怎么样|行不行|能行吗/, replacement: '质量如何', type: 'quality_inquiry' },
      { pattern: /靠谱吗|可信吗|可靠吗|放心吗/, replacement: '是否可靠', type: 'reliability_inquiry' },

      // 功能相关
      { pattern: /能干啥|有什么用|干嘛的|做啥的/, replacement: '功能是什么', type: 'function_inquiry' },
      { pattern: /咋用|怎么用|如何使用|使用方法是/, replacement: '使用方法', type: 'usage_inquiry' },
      { pattern: /支持吗|可以用吗|能使用吗/, replacement: '是否支持', type: 'support_inquiry' },

      // 时间相关
      { pattern: /多久|多长|几天|几个小时/, replacement: '需要多长时间', type: 'duration_inquiry' },
      { pattern: /什么时候|几点|啥时候|几时/, replacement: '具体时间', type: 'time_inquiry' },
      { pattern: /现在咋样|目前如何|当前状态/, replacement: '当前状态', type: 'current_status_inquiry' },

      // 位置相关
      { pattern: /在哪|位置|地方|怎么走|如何到达/, replacement: '位置在哪里', type: 'location_inquiry' },

      // 数量相关
      { pattern: /多少|几个|有几|若干/, replacement: '数量', type: 'quantity_inquiry' },

      // 原因结果
      { pattern: /为啥|为什么|咋回事|什么原因/, replacement: '原因', type: 'reason_inquiry' },
      { pattern: /咋办|怎么办|如何解决|怎么处理/, replacement: '解决方案', type: 'solution_inquiry' },
      { pattern: /会怎样|会怎么样|后果/, replacement: '结果', type: 'result_inquiry' },

      // 人员相关
      { pattern: /找谁|联系谁|谁能|哪位/, replacement: '负责人', type: 'person_inquiry' },

      // 确认类
      { pattern: /是不是|对不对|有没有|是不是真的/, replacement: '确认信息', type: 'confirmation_inquiry' },
    ];

    // 共指词词典
    this.coreferencePatterns = {
      // 人称代词
      '它': { type: 'pronoun', entities: [] },
      '他': { type: 'pronoun', entities: [] },
      '她': { type: 'pronoun', entities: [] },
      '他们': { type: 'pronoun', entities: [] },
      '她们': { type: 'pronoun', entities: [] },
      '它们': { type: 'pronoun', entities: [] },

      // 指示代词/事物指示（可复用）
      '这个': { type: 'demonstrative_or_object', entities: [] },
      '那个': { type: 'demonstrative_or_object', entities: [] },
      '这些': { type: 'demonstrative', entities: [] },
      '那些': { type: 'demonstrative', entities: [] },

      // 时间指示
      '之前': { type: 'temporal', entities: [] },
      '之后': { type: 'temporal', entities: [] },
      '刚才': { type: 'temporal', entities: [] },
      '现在': { type: 'temporal', entities: [] },
      '目前': { type: 'temporal', entities: [] },
      '这次': { type: 'temporal', entities: [] },
      '那次': { type: 'temporal', entities: [] },
      '上次的': { type: 'temporal', entities: [] },
      '之前的': { type: 'temporal', entities: [] },

      // 事物指示
      '这事': { type: 'object', entities: [] },
      '那事': { type: 'object', entities: [] },
      '这个问题': { type: 'object', entities: [] },
      '那个问题': { type: 'object', entities: [] },
      '这项': { type: 'object', entities: [] },
      '那项': { type: 'object', entities: [] },
    };

    // 最近对话中提取的实体（用于共指消解）
    this.recentEntities = [];
  }

  /**
   * 重写查询
   * @param {string} query - 原始查询
   * @param {Object} context - 上下文信息
   * @param {Array} context.messages - 对话历史消息
   * @param {Object} context.sessionData - 会话级别数据
   * @returns {Object} { rewritten, changes: [{type, original, replacement}] }
   */
  async rewrite(query, context = {}) {
    const changes = [];
    let rewritten = query;

    // 提取对话历史
    const messages = context.messages || [];
    const sessionData = context.sessionData || {};

    // 更新最近实体（从对话历史中提取）
    if (this.enableCoreferenceResolution || this.enableContextCompletion) {
      this._updateRecentEntities(messages);
    }

    // 1. 缩写展开
    if (this.enableAbbreviationExpansion) {
      const abbrevResult = this._expandAbbreviations(rewritten);
      if (abbrevResult.changed) {
        changes.push({
          type: 'abbreviation_expansion',
          original: abbrevResult.original,
          replacement: abbrevResult.expanded
        });
        rewritten = abbrevResult.expanded;
      }
    }

    // 2. 口语规范化
    if (this.enableColloquialNormalization) {
      const colloquialResult = this._normalizeColloquial(rewritten);
      if (colloquialResult.changed) {
        changes.push({
          type: 'colloquial_normalization',
          original: colloquialResult.original,
          replacement: colloquialResult.normalized
        });
        rewritten = colloquialResult.normalized;
      }
    }

    // 3. 共指消解
    if (this.enableCoreferenceResolution) {
      const corefResult = this._resolveCoreference(rewritten, messages);
      if (corefResult.changed) {
        changes.push({
          type: 'coreference_resolution',
          original: corefResult.original,
          replacement: corefResult.resolved
        });
        rewritten = corefResult.resolved;
      }
    }

    // 4. 上下文补全（多轮迭代直到收敛或达到最大次数）
    if (this.enableContextCompletion) {
      let prevRewritten = rewritten;
      for (let i = 0; i < this.maxRewriteIterations; i++) {
        const contextResult = this._completeContext(rewritten, messages, sessionData);
        if (contextResult.changed) {
          changes.push({
            type: 'context_completion',
            original: contextResult.original,
            replacement: contextResult.completed
          });
          rewritten = contextResult.completed;

          // 如果没有实质性变化，停止迭代
          if (rewritten === prevRewritten) break;
          prevRewritten = rewritten;
        } else {
          break;
        }
      }
    }

    return {
      rewritten,
      changes,
      hasChanges: changes.length > 0
    };
  }

  /**
   * 缩写展开
   */
  _expandAbbreviations(text) {
    let expanded = text;
    const originals = [];

    for (const [abbr, fullForm] of Object.entries(this.abbreviationDict)) {
      // 使用正则表达式进行大小写不敏感匹配
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      if (regex.test(expanded)) {
        originals.push(abbr);
        expanded = expanded.replace(regex, fullForm);
      }
    }

    return {
      changed: originals.length > 0,
      original: originals.join(', '),
      expanded
    };
  }

  /**
   * 口语规范化
   */
  _normalizeColloquial(text) {
    let normalized = text;
    let original = '';

    for (const { pattern, replacement } of this.colloquialPatterns) {
      if (pattern.test(normalized)) {
        original = normalized.match(pattern)[0];
        normalized = normalized.replace(pattern, replacement);
        break; // 每次只处理一个口语表达
      }
    }

    return {
      changed: original !== '',
      original,
      normalized
    };
  }

  /**
   * 共指消解
   */
  _resolveCoreference(text, messages) {
    let resolved = text;
    let original = '';

    // 检查是否包含共指词
    if (!this._compiledPatterns.corefRegex.test(resolved)) {
      return { changed: false, original: '', resolved };
    }

    // 从最近消息中查找可用的实体
    const entities = this._extractEntitiesFromMessages(messages);

    for (const corefWord of Object.keys(this.coreferencePatterns)) {
      if (resolved.includes(corefWord)) {
        // 找到最近的匹配实体
        const entity = this._findMostRecentEntity(corefWord, entities);

        if (entity) {
          original = corefWord;
          resolved = resolved.replace(corefWord, entity);
          break;
        }
      }
    }

    return {
      changed: original !== '',
      original,
      resolved
    };
  }

  /**
   * 从消息历史中提取实体
   */
  _extractEntitiesFromMessages(messages) {
    const entities = [];

    // 获取最近的消息（窗口内）
    const recentMessages = messages.slice(-this.contextWindow);

    for (const msg of recentMessages.reverse()) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

        // 提取被引用的实体（引号内的内容）
        const quotedMatches = content.match(this._compiledPatterns.quoted);
        if (quotedMatches) {
          for (const match of quotedMatches) {
            const entity = match.replace(/"/g, '');
            if (entity.length > 1 && entity.length < 50) {
              entities.push({
                text: entity,
                type: 'quoted',
                timestamp: Date.now()
              });
            }
          }
        }

        // 提取明确命名的实体（简单的启发式规则）
        // 匹配 "X 是一个 Y" 模式 - 直接从 match 结果解析
        let isMatch;
        this._compiledPatterns.isPattern.lastIndex = 0;
        while ((isMatch = this._compiledPatterns.isPattern.exec(content)) !== null) {
          if (isMatch[1]) {
            entities.push({
              text: isMatch[1].trim(),
              type: 'definition',
              timestamp: Date.now()
            });
          }
        }

        // 提取 "X 是 Y 的 Z" 模式（如 "机器学习是人工智能的一个分支"）
        let isOfMatch;
        this._compiledPatterns.isOfPattern.lastIndex = 0;
        while ((isOfMatch = this._compiledPatterns.isOfPattern.exec(content)) !== null) {
          // 提取主语：取 "X 是" 之前的部分
          const fullMatch = isOfMatch[0];
          const isIndex = fullMatch.indexOf('是');
          if (isIndex > 0) {
            const subject = fullMatch.substring(0, isIndex);
            if (subject.length > 1) {
              entities.push({
                text: subject.trim(),
                type: 'definition',
                timestamp: Date.now()
              });
            }
          }
        }

        // 提取"关于X"模式
        let aboutMatch;
        this._compiledPatterns.aboutPattern.lastIndex = 0;
        while ((aboutMatch = this._compiledPatterns.aboutPattern.exec(content)) !== null) {
          const topic = aboutMatch[1];
          if (topic && topic.length > 1 && topic.length < 50) {
            entities.push({
              text: topic.trim(),
              type: 'topic',
              timestamp: Date.now()
            });
          }
        }
      }
    }

    return entities;
  }

  /**
   * 查找最近的实体
   */
  _findMostRecentEntity(corefWord, entities) {
    if (entities.length === 0) return null;

    const corefType = this.coreferencePatterns[corefWord]?.type;

    // 根据共指词类型过滤实体
    let relevantEntities = entities;

    switch (corefType) {
      case 'temporal':
        // 时间指示词不映射到实体，返回空
        return null;

      case 'pronoun':
        // 人称代词通常指代之前提到的事物
        relevantEntities = entities.filter(e => e.type !== 'topic');
        break;

      case 'demonstrative':
      case 'demonstrative_or_object':
      case 'object':
        // 指示代词优先使用引号内的实体
        relevantEntities = entities.filter(e => e.type === 'quoted' || e.type === 'definition');
        break;

      default:
        break;
    }

    // 返回最相关的实体
    if (relevantEntities.length > 0) {
      return relevantEntities[0].text;
    }

    // 如果没有特定类型的实体，返回任何可用实体
    if (entities.length > 0) {
      return entities[0].text;
    }

    return null;
  }

  /**
   * 更新最近实体列表
   */
  _updateRecentEntities(messages) {
    this.recentEntities = this._extractEntitiesFromMessages(messages);
  }

  /**
   * 上下文补全
   */
  _completeContext(query, messages, sessionData) {
    // 检查查询是否需要上下文
    if (!this._needsContextCompletion(query)) {
      return { changed: false };
    }

    // 提取上下文信息
    const contextInfo = this._extractContextInfo(messages, sessionData);

    if (!contextInfo.hasInfo) {
      return { changed: false };
    }

    // 构建补全前缀
    const completionPrefix = this._buildCompletionPrefix(query, contextInfo);

    if (completionPrefix) {
      return {
        changed: true,
        original: query,
        completed: `${completionPrefix}${query}`
      };
    }

    return { changed: false };
  }

  /**
   * 检查查询是否需要上下文补全
   */
  _needsContextCompletion(query) {
    // 需要补全的信号词
    const signals = [
      '这个', '那个', '它', '他', '她', '他们', '她们', '它们',
      '之前', '之后', '刚才', '现在', '目前', '这次', '那次',
      '这事', '那事', '这个问题', '那个问题',
      '哪里', '哪儿', '谁', '什么', '怎么', '为什么', '多少'
    ];

    for (const signal of signals) {
      if (query.includes(signal)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 从消息中提取上下文信息
   */
  _extractContextInfo(messages, sessionData) {
    const info = {
      lastTopic: null,
      entities: [],
      lastIntent: null,
      hasInfo: false
    };

    // 获取最近的消息
    const recentMessages = messages.slice(-this.contextWindow);

    // 提取话题关键词
    const topicKeywords = ['关于', '讨论', '分析', '查询', '查看', '关于'];
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

        for (const keyword of topicKeywords) {
          const idx = content.indexOf(keyword);
          if (idx !== -1) {
            // 获取关键词后的内容作为话题
            const after = content.substring(idx + keyword.length).trim();
            // 取前30个字符
            const topic = after.substring(0, 30);
            if (topic && topic.length > 1) {
              info.lastTopic = topic;
              info.hasInfo = true;
              break;
            }
          }
        }

        if (info.lastTopic) break;
      }
    }

    // 提取引号中的实体
    for (const msg of recentMessages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const quotedMatches = content.match(/"([^"]+)"/g);
      if (quotedMatches) {
        for (const match of quotedMatches) {
          const entity = match.replace(/"/g, '');
          if (entity.length > 1 && entity.length < 50 && !info.entities.includes(entity)) {
            info.entities.push(entity);
            info.hasInfo = true;
          }
        }
      }
    }

    // 从会话数据中提取信息
    if (sessionData.currentTopic) {
      info.lastTopic = sessionData.currentTopic;
      info.hasInfo = true;
    }

    if (sessionData.lastEntity) {
      info.entities.push(sessionData.lastEntity);
      info.hasInfo = true;
    }

    return info;
  }

  /**
   * 构建补全前缀
   */
  _buildCompletionPrefix(query, contextInfo) {
    const parts = [];

    // 优先使用话题
    if (contextInfo.lastTopic) {
      // 检查查询是否已经包含了话题信息
      if (!query.includes(contextInfo.lastTopic)) {
        parts.push(`关于 ${contextInfo.lastTopic}，`);
      }
    }

    // 添现实体（如果有且查询中没有）
    if (contextInfo.entities.length > 0) {
      for (const entity of contextInfo.entities.slice(0, 2)) {
        if (!query.includes(entity)) {
          parts.push(`${entity}相关，`);
          break; // 只添加一个实体以避免过度补全
        }
      }
    }

    return parts.join('');
  }

  /**
   * 添加自定义缩写
   */
  addAbbreviation(abbr, fullForm) {
    this.abbreviationDict[abbr] = fullForm;
  }

  /**
   * 添加自定义口语模式
   */
  addColloquialPattern(pattern, replacement, type = 'custom') {
    if (pattern instanceof RegExp) {
      this.colloquialPatterns.push({ pattern, replacement, type });
    } else {
      this.colloquialPatterns.push({
        pattern: new RegExp(pattern, 'g'),
        replacement,
        type
      });
    }
  }

  /**
   * 获取服务统计信息
   */
  getStats() {
    return {
      abbreviationCount: Object.keys(this.abbreviationDict).length,
      colloquialPatternCount: this.colloquialPatterns.length,
      coreferencePatternCount: Object.keys(this.coreferencePatterns).length,
      recentEntitiesCount: this.recentEntities.length
    };
  }
}

module.exports = { QueryRewriteService };
