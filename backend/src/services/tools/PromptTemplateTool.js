/**
 * 提示词模板工具
 * 管理和使用提示词模板，支持变量替换
 */

class PromptTemplateTool {
  constructor(options = {}) {
    this.name = 'prompt_template';
    this.description = '提示词模板 - 管理和使用提示词模板，支持变量替换';
    this.category = 'developer';
    this.timeout = options.timeout || 5000;

    // 内置模板
    this.templates = new Map([
      ['code_review', {
        name: '代码审查',
        description: '对代码进行安全性和最佳实践审查',
        template: `请审查以下代码，关注：
1. 安全漏洞（SQL注入、XSS、硬编码密码）
2. 性能问题（循环内拼接字符串、重复查询）
3. 最佳实践（空catch、魔法数字）

代码语言：{{language}}

\`\`\`
{{code}}
\`\`\`

请提供详细的问题列表和改进建议。`
      }],
      ['translate', {
        name: '翻译助手',
        description: '多语言翻译',
        template: `请将以下{{from}}文本翻译为{{to}}：

{{text}}

要求：
- 保持原意
- 符合目标语言习惯
- 专业术语准确`
      }],
      ['summarize', {
        name: '文本摘要',
        description: '生成文本摘要',
        template: `请为以下文本生成简洁摘要（不超过{{maxLength}}字）：

{{text}}

摘要应包含：
- 核心观点
- 关键数据或事实
- 主要结论`
      }],
      ['question_answer', {
        name: '问答助手',
        description: '基于上下文回答问题',
        template: `基于以下上下文回答问题。

上下文：
{{context}}

问题：{{question}}

请给出准确、简洁的回答。`
      }],
      ['task_decompose', {
        name: '任务分解',
        description: '将复杂任务分解为子任务',
        template: `请将以下任务分解为可执行的子任务：

任务：{{task}}

要求：
- 每个子任务清晰、可执行
- 考虑任务依赖关系
- 标注优先级`
      }],
      ['email_writer', {
        name: '邮件撰写',
        description: '撰写专业邮件',
        template: `撰写一封邮件：

收件人：{{to}}
主题：{{subject}}
类型：{{type}}（正式/非正式）

内容要点：
{{points}}

要求：
- 语言专业得体
- 结构清晰
- 符合邮件格式`
      }]
    ]);
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['render', 'list', 'create', 'get'],
          description: '操作类型'
        },
        template: {
          type: 'string',
          description: '模板名称或模板内容'
        },
        variables: {
          type: 'object',
          description: '模板变量 {variableName: value}'
        },
        options: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '模板名称' },
            description: { type: 'string', description: '模板描述' }
          }
        }
      },
      required: ['action']
    };
  }

  async execute(params) {
    const { action, template, variables = {}, options = {} } = params;

    try {
      switch (action) {
        case 'render':
          return this.renderTemplate(template, variables);
        case 'list':
          return this.listTemplates();
        case 'create':
          return this.createTemplate(options.name, options.description, template);
        case 'get':
          return this.getTemplate(template);
        default:
          return { success: false, error: `未知操作: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  renderTemplate(templateName, variables) {
    let template = this.templates.get(templateName);

    // 如果传入的是模板内容而不是名称
    if (!template && typeof templateName === 'string' && templateName.includes('{{')) {
      template = { template: templateName };
    }

    if (!template) {
      return { success: false, error: `模板不存在: ${templateName}` };
    }

    let rendered = template.template || template;

    // 替换变量
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      if (rendered.includes(placeholder)) {
        rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }

    // 检查未填充的变量
    const unfilled = rendered.match(/\{\{(\w+)\}\}/g);
    if (unfilled) {
      return {
        success: true,
        rendered,
        unfilledVariables: unfilled.map(v => v.replace(/\{\{|\}\}/g, '')),
        warning: '存在未填充的变量'
      };
    }

    return { success: true, rendered };
  }

  listTemplates() {
    const templates = Array.from(this.templates.entries()).map(([name, t]) => ({
      name,
      description: t.description || t.name || ''
    }));

    return { success: true, templates };
  }

  getTemplate(name) {
    const template = this.templates.get(name);
    if (!template) {
      return { success: false, error: `模板不存在: ${name}` };
    }

    return {
      success: true,
      template: {
        name,
        description: template.description,
        template: template.template
      }
    };
  }

  createTemplate(name, description, templateContent) {
    if (!name || !templateContent) {
      return { success: false, error: '名称和模板内容不能为空' };
    }

    if (this.templates.has(name)) {
      return { success: false, error: '模板已存在' };
    }

    this.templates.set(name, {
      name,
      description: description || '',
      template: templateContent
    });

    return { success: true, message: `模板 ${name} 已创建` };
  }
}

module.exports = PromptTemplateTool;
