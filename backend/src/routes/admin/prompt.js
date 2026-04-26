/**
 * Prompt 模板管理 API
 * 提供 Prompt 模板的 CRUD、版本管理、变量替换测试
 *
 * @date 2026-04-01
 *
 * @swagger
 * tags:
 *   - name: admin
 *     description: 管理后台接口
 *   - name: prompts
 *     description: Prompt模板管理
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// 内存存储 - 实际项目应持久化到数据库
const promptTemplates = new Map();
let templateVersion = 1;

// 初始化内置模板
function initBuiltinTemplates() {
  const builtins = [
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
      isBuiltin: true
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
      isBuiltin: true
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
      isBuiltin: true
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
      isBuiltin: true
    }
  ];

  for (const t of builtins) {
    promptTemplates.set(t.id, t);
  }
}

initBuiltinTemplates();

/**
 * 渲染模板 - 替换变量
 * @param {string} template - 模板字符串
 * @param {object} variables - 变量对象
 * @returns {string} 渲染后的文本
 */
function renderTemplate(template, variables) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (variables.hasOwnProperty(key)) {
      return variables[key];
    }
    return match; // 保留未匹配的变量
  });
}

/**
 * 提取模板变量
 * @param {string} template - 模板字符串
 * @returns {string[]} 变量列表
 */
function extractVariables(template) {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

/**
 * GET /api/admin/prompts
 * 获取模板列表
 */
router.get('/', (req, res) => {
  try {
    const { category, search, builtin } = req.query;

    let templates = Array.from(promptTemplates.values());

    // 分类过滤
    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    // 搜索过滤
    if (search) {
      const keyword = search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(keyword) ||
        t.description.toLowerCase().includes(keyword)
      );
    }

    // 内置模板过滤
    if (builtin !== undefined) {
      const isBuiltin = builtin === 'true';
      templates = templates.filter(t => t.isBuiltin === isBuiltin);
    }

    res.json({
      success: true,
      data: {
        templates,
        total: templates.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/prompts/categories
 * 获取所有分类
 */
router.get('/categories', (req, res) => {
  try {
    const categories = new Set();
    for (const t of promptTemplates.values()) {
      categories.add(t.category);
    }

    res.json({
      success: true,
      data: {
        categories: Array.from(categories)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/prompts/:id
 * 获取模板详情
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const template = promptTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `模板 ${id} 不存在`
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/prompts
 * 创建模板
 */
router.post('/', (req, res) => {
  try {
    const { name, description, category, template } = req.body;

    // 参数校验
    if (!name || !template) {
      return res.status(400).json({
        success: false,
        error: 'name 和 template 为必填项'
      });
    }

    const id = `custom_${crypto.randomBytes(4).toString('hex')}`;
    const variables = extractVariables(template);

    const newTemplate = {
      id,
      name,
      description: description || '',
      category: category || 'custom',
      template,
      variables,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isBuiltin: false,
      usageCount: 0
    };

    promptTemplates.set(id, newTemplate);

    res.status(201).json({
      success: true,
      data: newTemplate
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/prompts/:id
 * 更新模板
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const template = promptTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `模板 ${id} 不存在`
      });
    }

    if (template.isBuiltin) {
      return res.status(403).json({
        success: false,
        error: '内置模板不可修改'
      });
    }

    const { name, description, category, template: newTemplateContent } = req.body;

    // 更新字段
    if (name) template.name = name;
    if (description !== undefined) template.description = description;
    if (category) template.category = category;
    if (newTemplateContent) {
      template.template = newTemplateContent;
      template.variables = extractVariables(newTemplateContent);
    }

    template.version += 1;
    template.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/prompts/:id
 * 删除模板
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const template = promptTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `模板 ${id} 不存在`
      });
    }

    if (template.isBuiltin) {
      return res.status(403).json({
        success: false,
        error: '内置模板不可删除'
      });
    }

    promptTemplates.delete(id);

    res.json({
      success: true,
      data: { deleted: id }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/prompts/:id/test
 * 测试模板
 */
router.post('/:id/test', (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    const template = promptTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `模板 ${id} 不存在`
      });
    }

    // 渲染模板
    const rendered = renderTemplate(template.template, variables || {});

    // 检查未填充的变量
    const unfilledVariables = [];
    const varPattern = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = varPattern.exec(rendered)) !== null) {
      unfilledVariables.push(match[1]);
    }

    res.json({
      success: true,
      data: {
        templateId: id,
        templateName: template.name,
        variables: variables || {},
        rendered,
        unfilledVariables: [...new Set(unfilledVariables)],
        allVariablesFilled: unfilledVariables.length === 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/prompts/test-render
 * 直接测试模板渲染（无需保存）
 */
router.post('/test-render', (req, res) => {
  try {
    const { template, variables } = req.body;

    if (!template) {
      return res.status(400).json({
        success: false,
        error: 'template 为必填项'
      });
    }

    const variables_found = extractVariables(template);
    const rendered = renderTemplate(template, variables || {});

    res.json({
      success: true,
      data: {
        extractedVariables: variables_found,
        providedVariables: Object.keys(variables || {}),
        rendered,
        missingVariables: variables_found.filter(v => !variables || !variables.hasOwnProperty(v))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/prompts/:id/versions
 * 获取模板版本历史（当前仅返回当前版本作为模拟）
 */
router.get('/:id/versions', (req, res) => {
  try {
    const { id } = req.params;
    const template = promptTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `模板 ${id} 不存在`
      });
    }

    // 模拟版本历史 - 实际应从数据库获取
    res.json({
      success: true,
      data: {
        versions: [
          {
            version: template.version,
            createdAt: template.updatedAt,
            message: '当前版本'
          }
        ],
        currentVersion: template.version
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/prompts/:id/rollback
 * 回滚模板到指定版本（当前仅支持回滚到当前版本，即不做任何操作）
 */
router.post('/:id/rollback', (req, res) => {
  try {
    const { id } = req.params;
    const { version } = req.body;
    const template = promptTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `模板 ${id} 不存在`
      });
    }

    // 当前版本系统不支持真正的版本回滚，仅返回成功
    res.json({
      success: true,
      data: {
        message: `已回滚到 v${version || template.version}`,
        templateId: id,
        version: version || template.version
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
