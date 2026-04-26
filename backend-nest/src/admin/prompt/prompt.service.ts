import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ListPromptsDto, CreatePromptDto, UpdatePromptDto, TestPromptDto, TestRenderDto, RollbackPromptDto } from './dto';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  isBuiltin: boolean;
  usageCount?: number;
}

@Injectable()
export class PromptService {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor() {
    this.initBuiltinTemplates();
  }

  private initBuiltinTemplates(): void {
    const builtins: PromptTemplate[] = [
      {
        id: 'builtin_code_review',
        name: '代码审查',
        description: '对代码进行安全性和最佳实践审查',
        category: 'developer',
        template: `请审查以下代码，关注：
1. 安全漏洞（SQL注入、XSS、硬编码密码）
2. 性能问题（循环内拼接字符串、重复查询）
3. 最佳实践（空catch、魔法数字）

代码语言：{{language}}

\`\`\`
{{code}}
\`\`\`

请提供详细的问题列表和改进建议。`,
        variables: ['language', 'code'],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isBuiltin: true,
      },
      {
        id: 'builtin_translate',
        name: '翻译助手',
        description: '多语言翻译',
        category: 'utility',
        template: `请将以下{{from}}文本翻译为{{to}}：

{{text}}

要求：
- 保持原意
- 符合目标语言习惯
- 专业术语准确`,
        variables: ['from', 'to', 'text'],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isBuiltin: true,
      },
      {
        id: 'builtin_summarize',
        name: '文本摘要',
        description: '生成文本摘要',
        category: 'utility',
        template: `请为以下文本生成简洁摘要（不超过{{maxLength}}字）：

{{text}}

摘要应包含：
- 核心主题
- 主要观点
- 关键结论`,
        variables: ['maxLength', 'text'],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isBuiltin: true,
      },
      {
        id: 'builtin_math',
        name: '数学解题',
        description: '分步数学解题',
        category: 'education',
        template: `请分步解答以下数学问题：

{{problem}}

请：
1. 分析题目条件
2. 写出解题步骤
3. 给出最终答案
4. 解释关键思路`,
        variables: ['problem'],
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isBuiltin: true,
      },
    ];

    for (const t of builtins) {
      this.templates.set(t.id, t);
    }
  }

  private renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (variables.hasOwnProperty(key)) {
        return variables[key];
      }
      return match;
    });
  }

  private extractVariables(template: string): string[] {
    const matches = template.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -2)))];
  }

  private generateId(): string {
    return `custom_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  listTemplates(query: ListPromptsDto): any {
    const { category, search, builtin } = query;

    let templates = Array.from(this.templates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (search) {
      const keyword = search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(keyword) ||
        t.description.toLowerCase().includes(keyword),
      );
    }

    if (builtin !== undefined) {
      const isBuiltin = builtin === 'true';
      templates = templates.filter(t => t.isBuiltin === isBuiltin);
    }

    return {
      templates,
      total: templates.length,
    };
  }

  listCategories(): any {
    const categories = new Set<string>();
    for (const t of this.templates.values()) {
      categories.add(t.category);
    }

    return {
      categories: Array.from(categories),
    };
  }

  getTemplate(id: string): any {
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundException(`模板 ${id} 不存在`);
    }

    return template;
  }

  createTemplate(dto: CreatePromptDto): any {
    if (!dto.name || !dto.template) {
      throw new Error('name 和 template 为必填项');
    }

    const id = this.generateId();
    const variables = this.extractVariables(dto.template);

    const newTemplate: PromptTemplate = {
      id,
      name: dto.name,
      description: dto.description || '',
      category: dto.category || 'custom',
      template: dto.template,
      variables,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isBuiltin: false,
      usageCount: 0,
    };

    this.templates.set(id, newTemplate);

    return newTemplate;
  }

  updateTemplate(id: string, dto: UpdatePromptDto): any {
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundException(`模板 ${id} 不存在`);
    }

    if (template.isBuiltin) {
      throw new ForbiddenException('内置模板不可修改');
    }

    if (dto.name) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.category) template.category = dto.category;
    if (dto.template) {
      template.template = dto.template;
      template.variables = this.extractVariables(dto.template);
    }

    template.version += 1;
    template.updatedAt = new Date().toISOString();

    return template;
  }

  deleteTemplate(id: string): any {
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundException(`模板 ${id} 不存在`);
    }

    if (template.isBuiltin) {
      throw new ForbiddenException('内置模板不可删除');
    }

    this.templates.delete(id);

    return { deleted: id };
  }

  testTemplate(id: string, dto: TestPromptDto): any {
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundException(`模板 ${id} 不存在`);
    }

    const rendered = this.renderTemplate(template.template, dto.variables || {});

    const unfilledVariables: string[] = [];
    const varPattern = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = varPattern.exec(rendered)) !== null) {
      unfilledVariables.push(match[1]);
    }

    return {
      templateId: id,
      templateName: template.name,
      variables: dto.variables || {},
      rendered,
      unfilledVariables: [...new Set(unfilledVariables)],
      allVariablesFilled: unfilledVariables.length === 0,
    };
  }

  testRender(dto: TestRenderDto): any {
    if (!dto.template) {
      throw new Error('template 为必填项');
    }

    const variables_found = this.extractVariables(dto.template);
    const rendered = this.renderTemplate(dto.template, dto.variables || {});

    return {
      extractedVariables: variables_found,
      providedVariables: Object.keys(dto.variables || {}),
      rendered,
      missingVariables: variables_found.filter(v => !dto.variables || !dto.variables.hasOwnProperty(v)),
    };
  }

  getVersions(id: string): any {
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundException(`模板 ${id} 不存在`);
    }

    return {
      versions: [
        {
          version: template.version,
          createdAt: template.updatedAt,
          message: '当前版本',
        },
      ],
      currentVersion: template.version,
    };
  }

  rollback(id: string, dto: RollbackPromptDto): any {
    const template = this.templates.get(id);
    if (!template) {
      throw new NotFoundException(`模板 ${id} 不存在`);
    }

    return {
      message: `已回滚到 v${dto.version || template.version}`,
      templateId: id,
      version: dto.version || template.version,
    };
  }
}
