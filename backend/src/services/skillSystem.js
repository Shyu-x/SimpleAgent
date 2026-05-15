/**
 * Agent技能系统
 * 支持技能注册、调用和组合，降低Token消耗
 */

const EventEmitter = require('events');
const AppError = require('../common/errors/AppError');

// 技能类型
const SkillType = {
  TOOL: 'tool',           // 工具技能
  TEMPLATE: 'template',   // 模板技能
  COMPOSITE: 'composite', // 组合技能
  PROMPT: 'prompt'       // 提示词技能
};

// 生成ID
const generateId = () => 'skill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

class SkillSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    this.skills = new Map();
    this.skillCache = new Map();
    this.cacheTTL = options.cacheTTL || 3600000; // 1小时
    this.maxCacheSize = options.maxCacheSize || 100;

    // 技能执行统计
    this.stats = {
      totalExecutions: 0,
      cacheHits: 0,
      tokenSavings: 0
    };

    // 注册内置技能
    this.registerBuiltInSkills();
  }

  /**
   * 注册内置技能
   */
  registerBuiltInSkills() {
    // ==================== 开发相关技能 ====================

    // 搜索技能
    this.register({
      id: 'builtin:web_search',
      name: '网页搜索',
      type: SkillType.TOOL,
      description: '搜索互联网获取最新信息，支持Google、Bing等搜索引擎',
      prompt: '请搜索以下内容：{{query}}',
      tools: ['web_search'],
      tokenCost: 50,
      keywords: ['搜索', '查找', '查询', '搜一下', 'search', '找一下'],
      examples: [
        { input: '搜索今天的天气', output: '调用web_search工具搜索天气' }
      ]
    });

    // 代码审查技能
    this.register({
      id: 'builtin:code_review',
      name: '代码审查',
      type: SkillType.TEMPLATE,
      description: '审查代码并提供改进建议，检测潜在bug和安全问题',
      prompt: `请审查以下代码：

\`\`\`{{language}}
{{code}}
\`\`\`

审查要点：
1. 代码质量和可读性
2. 潜在的bug和错误
3. 性能优化建议
4. 安全性问题`,
      requiredContext: ['code', 'language'],
      tokenCost: 100,
      keywords: ['审查', 'review', '检查代码', '代码检查'],
      examples: []
    });

    // 代码解释技能
    this.register({
      id: 'builtin:code_explain',
      name: '代码解释',
      type: SkillType.TEMPLATE,
      description: '详细解释代码的实现原理和工作机制',
      prompt: `请详细解释以下代码的实现原理：

\`\`\`{{language}}
{{code}}
\`\`\`

请包含：
1. 整体功能描述
2. 核心逻辑分析
3. 关键变量和函数作用
4. 可能的扩展方向`,
      requiredContext: ['code', 'language'],
      tokenCost: 80,
      keywords: ['解释', '说明', '讲讲', '是什么意思', 'explain', '分析'],
      examples: []
    });

    // 文档生成技能
    this.register({
      id: 'builtin:generate_docs',
      name: '文档生成',
      type: SkillType.TEMPLATE,
      description: '为代码生成专业的API文档和使用说明',
      prompt: `请为以下代码生成文档：

\`\`\`
{{code}}
\`\`\`

文档应包含：
- 功能描述
- 参数说明
- 返回值说明
- 使用示例`,
      requiredContext: ['code'],
      tokenCost: 80,
      keywords: ['文档', '注释', '生成文档', 'doc', '生成说明'],
      examples: []
    });

    // Bug修复技能
    this.register({
      id: 'builtin:bug_fix',
      name: 'Bug修复',
      type: SkillType.TEMPLATE,
      description: '分析错误信息并提供修复方案',
      prompt: `请分析以下错误并提供修复方案：

错误信息：
{{error}}

相关代码：
\`\`\`{{language}}
{{code}}
\`\`\`

请提供：
1. 错误原因分析
2. 修复代码
3. 预防建议`,
      requiredContext: ['error', 'code'],
      tokenCost: 120,
      keywords: ['修复', 'bug', '错误', '报错', '出错了', 'fix', 'error'],
      examples: []
    });

    // 单元测试生成技能
    this.register({
      id: 'builtin:generate_tests',
      name: '单元测试生成',
      type: SkillType.TEMPLATE,
      description: '为代码生成单元测试用例',
      prompt: `请为以下代码生成单元测试：

\`\`\`{{language}}
{{code}}
\`\`\`

请生成 {{framework}} 框架的测试用例，覆盖主要功能点。`,
      requiredContext: ['code', 'language'],
      tokenCost: 150,
      keywords: ['测试', 'test', '用例', '单元测试', '写测试'],
      examples: []
    });

    // ==================== 办公相关技能 ====================

    // 翻译技能
    this.register({
      id: 'builtin:translate',
      name: '翻译',
      type: SkillType.TEMPLATE,
      description: '翻译文本到指定语言，支持多种语言互译',
      prompt: '请将以下文本翻译成{{targetLanguage}}：{{text}}',
      requiredContext: ['text', 'targetLanguage'],
      tokenCost: 30,
      keywords: ['翻译', 'translate', '译成', '翻译成', '用英语', '用中文'],
      examples: []
    });

    // 总结归纳技能
    this.register({
      id: 'builtin:summarize',
      name: '总结归纳',
      type: SkillType.TEMPLATE,
      description: '将长文本精简为关键要点，支持多种格式',
      prompt: `请总结以下内容的核心要点：

{{text}}

要求：
1. 提取3-5个关键要点
2. 每个要点用一句话概括
3. 保持原意不变`,
      requiredContext: ['text'],
      tokenCost: 60,
      keywords: ['总结', '概括', '归纳', '提炼', 'summarize', '核心', '要点'],
      examples: []
    });

    // PPT大纲生成技能
    this.register({
      id: 'builtin:ppt_outline',
      name: 'PPT大纲生成',
      type: SkillType.TEMPLATE,
      description: '根据主题生成专业的PPT大纲结构',
      prompt: `请为"{{topic}}"生成一个专业的PPT大纲：

要求：
1. 10-15页幻灯片
2. 包含封面、目录、正文、总结
3. 每页包含标题和要点`,
      requiredContext: ['topic'],
      tokenCost: 100,
      keywords: ['PPT', '演示', '幻灯片', '大纲', 'presentation', 'slides'],
      examples: []
    });

    // 邮件撰写技能
    this.register({
      id: 'builtin:write_email',
      name: '邮件撰写',
      type: SkillType.TEMPLATE,
      description: '根据要求撰写专业的商务邮件',
      prompt: `请撰写一封{{type}}邮件：

收件人：{{to}}
主题：{{subject}}
主要内容：{{content}}

要求：
1. 语气专业得体
2. 格式规范
3. 逻辑清晰`,
      requiredContext: ['to', 'subject', 'content'],
      tokenCost: 50,
      keywords: ['邮件', 'email', '写信', '发邮件'],
      examples: []
    });

    // ==================== 生活相关技能 ====================

    // 旅行规划技能
    this.register({
      id: 'builtin:travel_plan',
      name: '旅行规划',
      type: SkillType.TEMPLATE,
      description: '生成详细的旅行计划攻略',
      prompt: `请为{{days}}天的{{destination}}之旅制定计划：

偏好：{{preferences}}

请包含：
1. 每日行程安排
2. 推荐景点
3. 当地美食
4. 住宿建议
5. 预算估算`,
      requiredContext: ['destination', 'days'],
      tokenCost: 150,
      keywords: ['旅行', '旅游', '出行', '攻略', '行程', 'travel', 'trip'],
      examples: []
    });

    // 健身计划技能
    this.register({
      id: 'builtin:fitness_plan',
      name: '健身计划',
      type: SkillType.TEMPLATE,
      description: '根据目标制定个性化健身方案',
      prompt: `请为以下目标制定健身计划：

目标：{{goal}}
周期：{{duration}}
体能水平：{{fitness_level}}

请包含：
1. 每周训练安排
2. 具体动作指导
3. 饮食建议
4. 注意事项`,
      requiredContext: ['goal', 'duration'],
      tokenCost: 120,
      keywords: ['健身', '锻炼', '运动', '减肥', '增肌', 'fitness', 'workout'],
      examples: []
    });

    // 食谱推荐技能
    this.register({
      id: 'builtin:recipe',
      name: '食谱推荐',
      type: SkillType.TEMPLATE,
      description: '根据食材或口味推荐菜谱',
      prompt: `请推荐{{meal}}食谱：

可用食材：{{ingredients}}
口味偏好：{{taste}}
人数：{{servings}}

请包含：
1. 食材清单
2. 烹饪步骤
3. 小贴士`,
      requiredContext: ['meal'],
      tokenCost: 80,
      keywords: ['食谱', '菜谱', '做法', '做饭', '烹饪', 'recipe', ' cook'],
      examples: []
    });

    // ==================== 创意相关技能 ====================

    // 写作润色技能
    this.register({
      id: 'builtin:writing_polish',
      name: '写作润色',
      type: SkillType.TEMPLATE,
      description: '优化文本的表达和结构',
      prompt: `请润色以下文本：

{{text}}

风格要求：{{style}}
重点：{{focus}}

请改进：
1. 语法和用词
2. 句式结构
3. 逻辑流畅度`,
      requiredContext: ['text'],
      tokenCost: 50,
      keywords: ['润色', '修改', '优化', '改写', 'polish', 'edit', '提升'],
      examples: []
    });

    // 头脑风暴技能
    this.register({
      id: 'builtin:brainstorm',
      name: '头脑风暴',
      type: SkillType.TEMPLATE,
      description: '围绕主题生成创意点子',
      prompt: `请围绕"{{topic}}"进行头脑风暴：

方向：{{direction}}
数量要求：{{count}}个

请提供：
1. 创新点子列表
2. 每个点子的简要说明
3. 可行性评估`,
      requiredContext: ['topic'],
      tokenCost: 100,
      keywords: ['头脑风暴', '创意', '点子', 'idea', '想法', ' brainstorm'],
      examples: []
    });

    // 故事创作技能
    this.register({
      id: 'builtin:story_write',
      name: '故事创作',
      type: SkillType.TEMPLATE,
      description: '根据设定创作完整的故事',
      prompt: `请创作一个{{genre}}故事：

主题：{{theme}}
角色：{{characters}}
长度：{{length}}

要求：
1. 情节完整
2. 人物立体
3. 有吸引力`,
      requiredContext: ['theme'],
      tokenCost: 200,
      keywords: ['故事', '小说', '创作', '写一个', 'story', 'fiction'],
      examples: []
    });

    // ==================== 数据分析技能 ====================

    // 数据分析技能
    this.register({
      id: 'builtin:data_analysis',
      name: '数据分析',
      type: SkillType.COMPOSITE,
      description: '分析数据并生成可视化报告',
      prompt: '请分析以下数据：{{data}}，并生成详细报告',
      skills: ['builtin:data_processing', 'builtin:generate_docs'],
      tokenCost: 150,
      keywords: ['分析', '数据', '统计', 'analysis', 'data', 'report'],
      examples: []
    });

    // Excel公式技能
    this.register({
      id: 'builtin:excel_formula',
      name: 'Excel公式',
      type: SkillType.TEMPLATE,
      description: '生成复杂的Excel公式解决方案',
      prompt: `请为以下场景生成Excel公式：

场景：{{scenario}}
需求：{{requirement}}
数据示例：{{example}}

请提供：
1. 公式方案
2. 使用说明
3. 替代方案`,
      requiredContext: ['scenario'],
      tokenCost: 80,
      keywords: ['Excel', '公式', '函数', '表格', 'spreadsheet'],
      examples: []
    });

    // ==================== 工具相关技能 ====================

    // 格式转换技能
    this.register({
      id: 'builtin:format_convert',
      name: '格式转换',
      type: SkillType.TOOL,
      description: '在不同格式之间转换内容',
      prompt: '请将以下内容从{{fromFormat}}转换为{{toFormat}}：{{content}}',
      requiredContext: ['content', 'fromFormat', 'toFormat'],
      tokenCost: 40,
      keywords: ['转换', '转换格式', '转为', 'convert', 'format'],
      examples: []
    });

    // JSON处理技能
    this.register({
      id: 'builtin:json_tool',
      name: 'JSON处理',
      type: SkillType.TEMPLATE,
      description: '格式化、验证和操作JSON数据',
      prompt: `请处理以下JSON：

操作：{{operation}}
数据：{{json}}

支持：格式化、验证、压缩、展开`,
      requiredContext: ['json'],
      tokenCost: 30,
      keywords: ['JSON', '格式化', '验证', 'parse', 'validate'],
      examples: []
    });

    // 正则表达式技能
    this.register({
      id: 'builtin:regex',
      name: '正则表达式',
      type: SkillType.TEMPLATE,
      description: '生成和解释正则表达式',
      prompt: `请{{action}}正则表达式：

需求：{{requirement}}
测试文本：{{testText}}

请包含：
1. 正则表达式
2. 解释说明
3. 匹配示例`,
      requiredContext: ['requirement'],
      tokenCost: 50,
      keywords: ['正则', 'regex', '匹配', 'pattern'],
      examples: []
    });

    // ==================== 问答相关技能 ====================

    // 问答生成技能
    this.register({
      id: 'builtin:qa_generate',
      name: '问答生成',
      type: SkillType.TEMPLATE,
      description: '从文本中提取问答对',
      prompt: `请从以下文本生成问答对：

{{text}}

请生成5-10个问答对，覆盖核心知识点。`,
      requiredContext: ['text'],
      tokenCost: 80,
      keywords: ['问答', '题库', 'quiz', 'question', 'FAQ'],
      examples: []
    });

    // 面试准备技能
    this.register({
      id: 'builtin:interview_prep',
      name: '面试准备',
      type: SkillType.TEMPLATE,
      description: '生成职位相关的面试问题和答案',
      prompt: `请为{{position}}职位生成面试准备材料：

经验级别：{{level}}
重点方向：{{focus}}

请包含：
1. 常见技术问题
2. 行为面试题
3. 面试技巧`,
      requiredContext: ['position'],
      tokenCost: 120,
      keywords: ['面试', 'interview', '应聘', '求职', '准备'],
      examples: []
    });
  }

  /**
   * 注册技能
   */
  register(skill) {
    const skillId = skill.id || generateId();

    if (this.skills.has(skillId)) {
      throw AppError.internalError(`Skill already exists: ${skillId}`);
    }

    const skillData = {
      id: skillId,
      name: skill.name,
      type: skill.type || SkillType.TOOL,
      description: skill.description || '',
      prompt: skill.prompt || '',
      tools: skill.tools || [],
      requiredContext: skill.requiredContext || [],
      tokenCost: skill.tokenCost || 50,
      examples: skill.examples || [],
      skills: skill.skills || [], // 组合技能包含的子技能
      metadata: skill.metadata || {},

      // 缓存配置
      cacheable: skill.cacheable !== false,
      cacheTTL: skill.cacheTTL || this.cacheTTL,

      // 使用统计
      usageCount: 0,
      avgExecutionTime: 0,
      successRate: 1.0,

      // 时间戳
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.skills.set(skillId, skillData);
    this.emit('skill:registered', skillData);

    return skillId;
  }

  /**
   * 批量注册技能
   */
  registerMany(skills) {
    const results = [];
    for (const skill of skills) {
      try {
        const id = this.register(skill);
        results.push({ id, success: true });
      } catch (error) {
        results.push({ id: skill.id, success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * 获取技能
   */
  get(skillId) {
    return this.skills.get(skillId);
  }

  /**
   * 列出所有技能
   */
  list(type = null) {
    const allSkills = Array.from(this.skills.values());

    if (type) {
      return allSkills.filter(s => s.type === type);
    }

    return allSkills;
  }

  /**
   * 搜索技能
   */
  search(query) {
    return Array.from(this.skills.values())
      .filter(skill =>
        skill.name.includes(query) ||
        skill.description.includes(query) ||
        (skill.tags && skill.tags.some(tag => tag.includes(query)))
      );
  }

  /**
   * 验证技能上下文
   */
  validateContext(skillId, context) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { valid: false, error: 'Skill not found' };
    }

    const missing = skill.requiredContext.filter(key => !context[key]);

    if (missing.length > 0) {
      return { valid: false, error: `Missing required context: ${missing.join(', ')}` };
    }

    return { valid: true };
  }

  /**
   * 执行技能
   */
  async execute(skillId, context = {}) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw AppError.toolError('TOOL_NOT_FOUND', `Skill not found: ${skillId}`);
    }

    // 验证上下文
    const validation = this.validateContext(skillId, context);
    if (!validation.valid) {
      throw AppError.validationError('validation', validation.error);
    }

    // 检查缓存
    if (skill.cacheable) {
      const cacheKey = this.getCacheKey(skillId, context);
      const cached = this.skillCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < skill.cacheTTL) {
        this.stats.cacheHits++;
        this.emit('skill:cache_hit', { skillId, context });
        return cached.result;
      }
    }

    const startTime = Date.now();
    this.stats.totalExecutions++;

    try {
      let result;

      switch (skill.type) {
        case SkillType.TEMPLATE:
          result = await this.executeTemplate(skill, context);
          break;

        case SkillType.COMPOSITE:
          result = await this.executeComposite(skill, context);
          break;

        case SkillType.PROMPT:
          result = await this.executePrompt(skill, context);
          break;

        case SkillType.TOOL:
        default:
          result = await this.executeTool(skill, context);
          break;
      }

      // 更新统计
      const executionTime = Date.now() - startTime;
      skill.usageCount++;
      skill.avgExecutionTime = (skill.avgExecutionTime * (skill.usageCount - 1) + executionTime) / skill.usageCount;

      // 缓存结果
      if (skill.cacheable) {
        const cacheKey = this.getCacheKey(skillId, context);
        this.setCache(cacheKey, result, skill.cacheTTL);
      }

      // 计算Token节省
      this.stats.tokenSavings += skill.tokenCost;

      this.emit('skill:executed', {
        skillId,
        context,
        executionTime,
        success: true
      });

      return result;

    } catch (error) {
      skill.successRate = Math.max(0, skill.successRate - 0.1);

      this.emit('skill:executed', {
        skillId,
        context,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * 执行模板技能
   */
  async executeTemplate(skill, context) {
    // 替换占位符
    let prompt = skill.prompt;
    for (const [key, value] of Object.entries(context)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return {
      type: 'prompt',
      content: prompt,
      skillId: skill.id,
      tokenCost: skill.tokenCost
    };
  }

  /**
   * 执行组合技能
   */
  async executeComposite(skill, context) {
    const results = [];

    for (const subSkillId of skill.skills) {
      const subResult = await this.execute(subSkillId, context);
      results.push(subResult);
    }

    return {
      type: 'composite',
      results,
      skillId: skill.id,
      totalTokenCost: results.reduce((sum, r) => sum + (r.tokenCost || 0), 0)
    };
  }

  /**
   * 执行提示词技能
   */
  async executePrompt(skill, context) {
    return this.executeTemplate(skill, context);
  }

  /**
   * 执行工具技能
   */
  async executeTool(skill, context) {
    return {
      type: 'tool_call',
      tools: skill.tools,
      context,
      skillId: skill.id,
      tokenCost: skill.tokenCost
    };
  }

  /**
   * 组合技能
   */
  compose(name, description, skillIds, options = {}) {
    const compositeId = generateId();

    this.register({
      id: compositeId,
      name,
      type: SkillType.COMPOSITE,
      description,
      skills: skillIds,
      tokenCost: options.tokenCost || this.calculateCompositeCost(skillIds),
      ...options
    });

    return compositeId;
  }

  /**
   * 计算组合技能成本
   */
  calculateCompositeCost(skillIds) {
    let totalCost = 0;
    for (const skillId of skillIds) {
      const skill = this.skills.get(skillId);
      if (skill) {
        totalCost += skill.tokenCost;
      }
    }
    return Math.ceil(totalCost * 0.8); // 组合技能有20%折扣
  }

  /**
   * 获取缓存键
   */
  getCacheKey(skillId, context) {
    return `${skillId}:${JSON.stringify(context)}`;
  }

  /**
   * 设置缓存
   */
  setCache(key, result, ttl) {
    // 清理过期缓存
    if (this.skillCache.size >= this.maxCacheSize) {
      this.cleanupCache();
    }

    this.skillCache.set(key, {
      result,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * 清理过期缓存
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.skillCache) {
      if (now - value.timestamp > value.ttl) {
        this.skillCache.delete(key);
      }
    }

    // 如果仍然过多，随机删除一半
    if (this.skillCache.size > this.maxCacheSize / 2) {
      const keysToDelete = Array.from(this.skillCache.keys())
        .slice(0, this.skillCache.size - this.maxCacheSize / 2);
      for (const key of keysToDelete) {
        this.skillCache.delete(key);
      }
    }
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      ...this.stats,
      totalSkills: this.skills.size,
      cacheSize: this.skillCache.size,
      skillsByType: {
        tool: this.list(SkillType.TOOL).length,
        template: this.list(SkillType.TEMPLATE).length,
        composite: this.list(SkillType.COMPOSITE).length,
        prompt: this.list(SkillType.PROMPT).length
      }
    };
  }

  /**
   * 删除技能
   */
  delete(skillId) {
    if (!this.skills.has(skillId)) {
      return false;
    }

    this.skills.delete(skillId);
    this.emit('skill:deleted', skillId);
    return true;
  }

  /**
   * 更新技能
   */
  update(skillId, updates) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw AppError.toolError('TOOL_NOT_FOUND', `Skill not found: ${skillId}`);
    }

    Object.assign(skill, updates, { updatedAt: Date.now() });
    this.emit('skill:updated', skill);
    return skill;
  }

  /**
   * 导出技能
   */
  export(skillId) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return null;
    }

    // 导出时不包含运行时统计
    const { usageCount, avgExecutionTime, successRate, ...exportData } = skill;
    return exportData;
  }

  /**
   * 导入技能
   */
  import(skillData) {
    return this.register({
      ...skillData,
      id: skillData.id || generateId()
    });
  }
}

module.exports = {
  SkillSystem,
  SkillType
};