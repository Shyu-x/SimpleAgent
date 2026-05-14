/**
 * 技能系统路由
 * 委托业务逻辑给 SkillSystem 服务
 */
const express = require('express');
const router = express.Router();
const { SkillSystem, SkillType } = require('../services/skillSystem');
const { asyncHandler } = require('../middleware/errorHandler');

const skillSystem = new SkillSystem({ cacheTTL: 3600000, maxCacheSize: 100 });

// GET / - list or search
router.get('/', (req, res) => {
  const { type, search, q } = req.query;
  if (q) {
    return res.json({ success: true, skills: skillSystem.search(q) });
  }
  const skills = search ? skillSystem.search(search) : skillSystem.list(type);
  res.json({
    success: true,
    skills: skills.map(s => ({
      id: s.id, name: s.name, type: s.type, description: s.description,
      tokenCost: s.tokenCost, usageCount: s.usageCount, successRate: s.successRate
    }))
  });
});

router.get('/stats', (_req, res) => res.json({ success: true, stats: skillSystem.getStats() }));

// GET /:skillId
router.get('/:skillId', (req, res) => {
  const skill = skillSystem.get(req.params.skillId);
  if (!skill) return res.status(404).json({ error: { message: 'Skill not found' } });
  res.json({ success: true, skill: skillSystem.export(req.params.skillId) });
});

// POST / - register
router.post('/', (req, res) => {
  const { name, type, description, prompt, tools, requiredContext, tokenCost, cacheable, skills } = req.body;
  if (!name) return res.status(400).json({ error: { message: 'Skill name is required', type: 'validation_error' } });
  res.json({ success: true, skillId: skillSystem.register({ name, type: type || SkillType.TEMPLATE, description, prompt, tools, requiredContext, tokenCost, cacheable, skills }) });
});

// POST /batch
router.post('/batch', (req, res) => {
  const { skills } = req.body;
  if (!Array.isArray(skills)) return res.status(400).json({ error: { message: 'skills must be an array', type: 'validation_error' } });
  res.json({ success: true, results: skillSystem.registerMany(skills) });
});

// POST /import
router.post('/import', (req, res) => {
  const { skill } = req.body;
  if (!skill) return res.status(400).json({ error: { message: 'skill data is required', type: 'validation_error' } });
  res.json({ success: true, skillId: skillSystem.import(skill) });
});

// PUT /:skillId
router.put('/:skillId', (req, res) => {
  res.json({ success: true, skill: skillSystem.update(req.params.skillId, req.body) });
});

// DELETE /:skillId
router.delete('/:skillId', (req, res) => {
  if (!skillSystem.delete(req.params.skillId)) return res.status(404).json({ error: { message: 'Skill not found' } });
  res.json({ success: true, message: 'Skill deleted' });
});

// POST /:skillId/execute
router.post('/:skillId/execute', asyncHandler(async (req, res) => {
  res.json({ success: true, result: await skillSystem.execute(req.params.skillId, req.body) });
}));

// POST /compose
router.post('/compose', (req, res) => {
  const { name, description, skillIds, options } = req.body;
  if (!name || !skillIds || !Array.isArray(skillIds)) {
    return res.status(400).json({ error: { message: 'name and skillIds are required', type: 'validation_error' } });
  }
  res.json({ success: true, skillId: skillSystem.compose(name, description, skillIds, options) });
});

module.exports = router;
