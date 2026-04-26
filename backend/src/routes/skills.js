const express = require('express');
const router = express.Router();
const { SkillSystem, SkillType } = require('../services/skillSystem');

// 创建技能系统实例
const skillSystem = new SkillSystem({
  cacheTTL: 3600000,
  maxCacheSize: 100
});

/**
 * 获取所有技能
 */
router.get('/', (req, res) => {
  try {
    const { type, search } = req.query;
    let skills;

    if (search) {
      skills = skillSystem.search(search);
    } else {
      skills = skillSystem.list(type);
    }

    res.json({
      success: true,
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        description: s.description,
        tokenCost: s.tokenCost,
        usageCount: s.usageCount,
        successRate: s.successRate
      }))
    });
  } catch (error) {
    console.error('Get skills error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 获取技能详情
 */
router.get('/:skillId', (req, res) => {
  try {
    const { skillId } = req.params;
    const skill = skillSystem.get(skillId);

    if (!skill) {
      return res.status(404).json({ error: { message: 'Skill not found' } });
    }

    res.json({
      success: true,
      skill: skillSystem.export(skillId)
    });
  } catch (error) {
    console.error('Get skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 注册技能
 */
router.post('/', (req, res) => {
  try {
    const { name, type, description, prompt, tools, requiredContext, tokenCost, cacheable, skills } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { message: 'Skill name is required', type: 'validation_error' }
      });
    }

    const skillId = skillSystem.register({
      name,
      type: type || SkillType.TEMPLATE,
      description,
      prompt,
      tools,
      requiredContext,
      tokenCost,
      cacheable,
      skills
    });

    res.json({
      success: true,
      skillId
    });
  } catch (error) {
    console.error('Register skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 批量注册技能
 */
router.post('/batch', (req, res) => {
  try {
    const { skills } = req.body;

    if (!Array.isArray(skills)) {
      return res.status(400).json({
        error: { message: 'skills must be an array', type: 'validation_error' }
      });
    }

    const results = skillSystem.registerMany(skills);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Batch register error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 更新技能
 */
router.put('/:skillId', (req, res) => {
  try {
    const { skillId } = req.params;
    const updates = req.body;

    const skill = skillSystem.update(skillId, updates);

    res.json({
      success: true,
      skill
    });
  } catch (error) {
    console.error('Update skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 删除技能
 */
router.delete('/:skillId', (req, res) => {
  try {
    const { skillId } = req.params;
    const deleted = skillSystem.delete(skillId);

    if (!deleted) {
      return res.status(404).json({ error: { message: 'Skill not found' } });
    }

    res.json({
      success: true,
      message: 'Skill deleted'
    });
  } catch (error) {
    console.error('Delete skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 执行技能
 */
router.post('/:skillId/execute', async (req, res) => {
  try {
    const { skillId } = req.params;
    const context = req.body;

    const result = await skillSystem.execute(skillId, context);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Execute skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 组合技能
 */
router.post('/compose', (req, res) => {
  try {
    const { name, description, skillIds, options } = req.body;

    if (!name || !skillIds || !Array.isArray(skillIds)) {
      return res.status(400).json({
        error: { message: 'name and skillIds are required', type: 'validation_error' }
      });
    }

    const compositeId = skillSystem.compose(name, description, skillIds, options);

    res.json({
      success: true,
      skillId: compositeId
    });
  } catch (error) {
    console.error('Compose skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 导出技能
 */
router.get('/:skillId/export', (req, res) => {
  try {
    const { skillId } = req.params;
    const exported = skillSystem.export(skillId);

    if (!exported) {
      return res.status(404).json({ error: { message: 'Skill not found' } });
    }

    res.json({
      success: true,
      skill: exported
    });
  } catch (error) {
    console.error('Export skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 导入技能
 */
router.post('/import', (req, res) => {
  try {
    const { skill } = req.body;

    if (!skill) {
      return res.status(400).json({
        error: { message: 'skill data is required', type: 'validation_error' }
      });
    }

    const skillId = skillSystem.import(skill);

    res.json({
      success: true,
      skillId
    });
  } catch (error) {
    console.error('Import skill error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 获取技能统计
 */
router.get('/stats', (_req, res) => {
  try {
    const stats = skillSystem.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get stats error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * 搜索技能
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        error: { message: 'Search query is required', type: 'validation_error' }
      });
    }

    const skills = skillSystem.search(q);

    res.json({
      success: true,
      skills
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

module.exports = router;