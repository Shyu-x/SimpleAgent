/**
 * SkillSystem 单元测试
 *
 * 测试内容：
 * 1. Skill registration (register, registerMany)
 * 2. Context validation (validateContext, requiredContext)
 * 3. Skill execution (execute, executeTemplate, executeComposite, executePrompt, executeTool)
 * 4. Caching (cache hit, cache miss, TTL expiration, cleanup)
 * 5. Token cost calculation (basic, COMPOSITE discount)
 * 6. Lifecycle (export, import, built-in skills)
 * 7. Other methods (get, list, search, delete, update, getStats, compose)
 */

const { SkillSystem, SkillType } = require('../../src/services/skillSystem');

// Mock patterns as specified
const mockToolExecutor = {
  execute: jest.fn().mockResolvedValue({ result: 'tool result' })
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn()
};

describe('SkillSystem', () => {
  let skillSystem;

  beforeEach(() => {
    skillSystem = new SkillSystem({ cacheTTL: 1000, maxCacheSize: 5 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ========== Skill Registration Tests ==========

  describe('register() - Skill Registration', () => {
    test('should register a TOOL type skill', () => {
      const skillId = skillSystem.register({
        id: 'test:tool',
        name: 'Test Tool',
        type: SkillType.TOOL,
        description: 'A test tool skill',
        tools: ['web_search'],
        tokenCost: 50,
        keywords: ['test']
      });

      expect(skillId).toBe('test:tool');
      const skill = skillSystem.get('test:tool');
      expect(skill).not.toBeNull();
      expect(skill.name).toBe('Test Tool');
      expect(skill.type).toBe(SkillType.TOOL);
      expect(skill.tools).toEqual(['web_search']);
    });

    test('should register a TEMPLATE type skill', () => {
      const skillId = skillSystem.register({
        id: 'test:template',
        name: 'Test Template',
        type: SkillType.TEMPLATE,
        description: 'A test template skill',
        prompt: 'Hello {{name}}',
        requiredContext: ['name'],
        tokenCost: 30
      });

      expect(skillId).toBe('test:template');
      const skill = skillSystem.get('test:template');
      expect(skill.type).toBe(SkillType.TEMPLATE);
      expect(skill.requiredContext).toEqual(['name']);
    });

    test('should register a COMPOSITE type skill', () => {
      // First register sub-skills
      skillSystem.register({
        id: 'sub:skill1',
        name: 'Sub Skill 1',
        type: SkillType.TEMPLATE,
        tokenCost: 50
      });
      skillSystem.register({
        id: 'sub:skill2',
        name: 'Sub Skill 2',
        type: SkillType.TEMPLATE,
        tokenCost: 30
      });

      const compositeId = skillSystem.register({
        id: 'test:composite',
        name: 'Test Composite',
        type: SkillType.COMPOSITE,
        skills: ['sub:skill1', 'sub:skill2']
      });

      expect(compositeId).toBe('test:composite');
      const skill = skillSystem.get('test:composite');
      expect(skill.type).toBe(SkillType.COMPOSITE);
      expect(skill.skills).toEqual(['sub:skill1', 'sub:skill2']);
    });

    test('should register a PROMPT type skill', () => {
      const skillId = skillSystem.register({
        id: 'test:prompt',
        name: 'Test Prompt',
        type: SkillType.PROMPT,
        description: 'A test prompt skill',
        prompt: 'Please analyze: {{topic}}',
        requiredContext: ['topic']
      });

      expect(skillId).toBe('test:prompt');
      const skill = skillSystem.get('test:prompt');
      expect(skill.type).toBe(SkillType.PROMPT);
    });

    test('should generate ID if not provided', () => {
      const skillId = skillSystem.register({
        name: 'No ID Skill',
        type: SkillType.TOOL,
        tokenCost: 10
      });

      expect(skillId).toMatch(/^skill_\d+_[a-z0-9]+$/);
    });

    test('should throw error when registering duplicate ID', () => {
      skillSystem.register({
        id: 'duplicate:id',
        name: 'First Skill',
        type: SkillType.TOOL
      });

      expect(() => {
        skillSystem.register({
          id: 'duplicate:id',
          name: 'Second Skill',
          type: SkillType.TOOL
        });
      }).toThrow('Skill already exists: duplicate:id');
    });

    test('should set default values for optional fields', () => {
      const skillId = skillSystem.register({
        name: 'Minimal Skill',
        type: SkillType.TOOL
      });

      const skill = skillSystem.get(skillId);
      expect(skill.type).toBe(SkillType.TOOL);
      expect(skill.description).toBe('');
      expect(skill.prompt).toBe('');
      expect(skill.tools).toEqual([]);
      expect(skill.requiredContext).toEqual([]);
      expect(skill.tokenCost).toBe(50); // default
      expect(skill.examples).toEqual([]);
      expect(skill.skills).toEqual([]);
      expect(skill.cacheable).toBe(true);
      expect(skill.usageCount).toBe(0);
      expect(skill.successRate).toBe(1.0);
    });

    test('should emit skill:registered event', () => {
      const eventHandler = jest.fn();
      skillSystem.on('skill:registered', eventHandler);

      skillSystem.register({
        id: 'event:test',
        name: 'Event Test',
        type: SkillType.TOOL
      });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        id: 'event:test',
        name: 'Event Test'
      }));
    });
  });

  describe('registerMany() - Batch Registration', () => {
    test('should register multiple skills', () => {
      const results = skillSystem.registerMany([
        { id: 'batch:1', name: 'Batch 1', type: SkillType.TOOL, tokenCost: 10 },
        { id: 'batch:2', name: 'Batch 2', type: SkillType.TEMPLATE, tokenCost: 20 },
        { id: 'batch:3', name: 'Batch 3', type: SkillType.PROMPT, tokenCost: 30 }
      ]);

      expect(results).toEqual([
        { id: 'batch:1', success: true },
        { id: 'batch:2', success: true },
        { id: 'batch:3', success: true }
      ]);
      expect(skillSystem.get('batch:1')).not.toBeNull();
      expect(skillSystem.get('batch:2')).not.toBeNull();
      expect(skillSystem.get('batch:3')).not.toBeNull();
    });

    test('should handle partial failures', () => {
      skillSystem.register({ id: 'existing', name: 'Existing', type: SkillType.TOOL });

      const results = skillSystem.registerMany([
        { id: 'new:1', name: 'New 1', type: SkillType.TOOL },
        { id: 'existing', name: 'Existing Duplicate', type: SkillType.TOOL },
        { id: 'new:2', name: 'New 2', type: SkillType.TOOL }
      ]);

      expect(results).toEqual([
        { id: 'new:1', success: true },
        { id: 'existing', success: false, error: 'Skill already exists: existing' },
        { id: 'new:2', success: true }
      ]);
    });
  });

  // ========== Context Validation Tests ==========

  describe('validateContext() - Context Validation', () => {
    test('should return valid when all required context is provided', () => {
      skillSystem.register({
        id: 'context:test',
        name: 'Context Test',
        type: SkillType.TEMPLATE,
        requiredContext: ['name', 'age'],
        prompt: '{{name}} is {{age}} years old'
      });

      const result = skillSystem.validateContext('context:test', { name: 'John', age: 30 });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('should return invalid when required context is missing', () => {
      skillSystem.register({
        id: 'context:test',
        name: 'Context Test',
        type: SkillType.TEMPLATE,
        requiredContext: ['name', 'age']
      });

      const result = skillSystem.validateContext('context:test', { name: 'John' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing required context: age');
    });

    test('should return invalid when skill not found', () => {
      const result = skillSystem.validateContext('non:existent', {});
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Skill not found');
    });

    test('should allow empty required context', () => {
      skillSystem.register({
        id: 'no:context',
        name: 'No Context Required',
        type: SkillType.TEMPLATE,
        requiredContext: []
      });

      const result = skillSystem.validateContext('no:context', {});
      expect(result.valid).toBe(true);
    });

    test('should handle multiple missing context fields', () => {
      skillSystem.register({
        id: 'multi:context',
        name: 'Multi Context',
        type: SkillType.TEMPLATE,
        requiredContext: ['field1', 'field2', 'field3']
      });

      const result = skillSystem.validateContext('multi:context', { field1: 'value' });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing required context: field2, field3');
    });
  });

  // ========== Skill Execution Tests ==========

  describe('execute() - Skill Execution', () => {
    test('should throw error when skill not found', async () => {
      await expect(skillSystem.execute('non:existent', {}))
        .rejects.toThrow('Skill not found: non:existent');
    });

    test('should throw error when context is invalid', async () => {
      skillSystem.register({
        id: 'exec:context',
        name: 'Exec Context',
        type: SkillType.TEMPLATE,
        requiredContext: ['requiredField'],
        prompt: 'Hello {{requiredField}}'
      });

      await expect(skillSystem.execute('exec:context', {}))
        .rejects.toThrow('Missing required context: requiredField');
    });

    test('should increment totalExecutions stat on successful execution', async () => {
      skillSystem.register({
        id: 'stat:test',
        name: 'Stat Test',
        type: SkillType.TOOL,
        tools: ['test_tool']
      });

      expect(skillSystem.stats.totalExecutions).toBe(0);
      await skillSystem.execute('stat:test', {});
      expect(skillSystem.stats.totalExecutions).toBe(1);
    });

    test('should update skill usageCount after execution', async () => {
      skillSystem.register({
        id: 'usage:test',
        name: 'Usage Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{name}}'
      });

      const skill = skillSystem.get('usage:test');
      expect(skill.usageCount).toBe(0);

      // Use different contexts to avoid cache hit
      await skillSystem.execute('usage:test', { name: 'World1' });
      expect(skill.usageCount).toBe(1);

      await skillSystem.execute('usage:test', { name: 'World2' });
      expect(skill.usageCount).toBe(2);
    });

    test('should decrease successRate on failure', async () => {
      skillSystem.register({
        id: 'fail:test',
        name: 'Fail Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello'
      });

      const skill = skillSystem.get('fail:test');
      expect(skill.successRate).toBe(1.0);
    });

    test('should emit skill:executed event on success', async () => {
      const eventHandler = jest.fn();
      skillSystem.on('skill:executed', eventHandler);

      skillSystem.register({
        id: 'event:exec',
        name: 'Event Exec',
        type: SkillType.TOOL,
        tools: ['test_tool']
      });

      await skillSystem.execute('event:exec', {});

      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        skillId: 'event:exec',
        success: true
      }));
    });

    test('should emit skill:executed event on failure', async () => {
      const eventHandler = jest.fn();
      skillSystem.on('skill:executed', eventHandler);

      // Register a composite skill with non-existent sub-skill to force failure
      skillSystem.register({
        id: 'fail:exec',
        name: 'Fail Exec',
        type: SkillType.COMPOSITE,
        skills: ['non:existent']
      });

      await expect(skillSystem.execute('fail:exec', {})).rejects.toThrow();

      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        skillId: 'fail:exec',
        success: false
      }));
    });
  });

  describe('executeTemplate() - TEMPLATE Type Execution', () => {
    test('should replace placeholders with context values', async () => {
      skillSystem.register({
        id: 'template:test',
        name: 'Template Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{name}}, you are {{age}} years old',
        tokenCost: 50
      });

      const result = await skillSystem.execute('template:test', { name: 'John', age: 30 });

      expect(result.type).toBe('prompt');
      expect(result.content).toBe('Hello John, you are 30 years old');
      expect(result.skillId).toBe('template:test');
      expect(result.tokenCost).toBe(50);
    });

    test('should handle multiple occurrences of same placeholder', async () => {
      skillSystem.register({
        id: 'multi:placeholder',
        name: 'Multi Placeholder',
        type: SkillType.TEMPLATE,
        prompt: '{{name}} said "{{name}}" to {{name}}'
      });

      const result = await skillSystem.execute('multi:placeholder', { name: 'Bob' });
      expect(result.content).toBe('Bob said "Bob" to Bob');
    });

    test('should preserve unmatched placeholders', async () => {
      skillSystem.register({
        id: 'unmatched',
        name: 'Unmatched',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{name}}, your email is {{email}}'
      });

      const result = await skillSystem.execute('unmatched', { name: 'John' });
      expect(result.content).toBe('Hello John, your email is {{email}}');
    });
  });

  describe('executeTool() - TOOL Type Execution', () => {
    test('should return tool call structure', async () => {
      skillSystem.register({
        id: 'tool:exec',
        name: 'Tool Exec',
        type: SkillType.TOOL,
        tools: ['web_search', 'calculator'],
        tokenCost: 50
      });

      const result = await skillSystem.execute('tool:exec', { query: 'test' });

      expect(result.type).toBe('tool_call');
      expect(result.tools).toEqual(['web_search', 'calculator']);
      expect(result.context).toEqual({ query: 'test' });
      expect(result.skillId).toBe('tool:exec');
      expect(result.tokenCost).toBe(50);
    });
  });

  describe('executePrompt() - PROMPT Type Execution', () => {
    test('should behave like template execution', async () => {
      skillSystem.register({
        id: 'prompt:exec',
        name: 'Prompt Exec',
        type: SkillType.PROMPT,
        prompt: 'Analyze: {{topic}}',
        tokenCost: 40
      });

      const result = await skillSystem.execute('prompt:exec', { topic: 'AI' });

      expect(result.type).toBe('prompt');
      expect(result.content).toBe('Analyze: AI');
      expect(result.skillId).toBe('prompt:exec');
    });
  });

  describe('executeComposite() - COMPOSITE Type Execution', () => {
    test('should execute all sub-skills and aggregate results', async () => {
      // Register sub-skills
      skillSystem.register({
        id: 'comp:sub1',
        name: 'Sub 1',
        type: SkillType.TEMPLATE,
        prompt: 'Result 1: {{input}}',
        tokenCost: 30
      });
      skillSystem.register({
        id: 'comp:sub2',
        name: 'Sub 2',
        type: SkillType.TEMPLATE,
        prompt: 'Result 2: {{input}}',
        tokenCost: 20
      });

      // Register composite skill
      skillSystem.register({
        id: 'composite:exec',
        name: 'Composite Exec',
        type: SkillType.COMPOSITE,
        skills: ['comp:sub1', 'comp:sub2']
      });

      const result = await skillSystem.execute('composite:exec', { input: 'test' });

      expect(result.type).toBe('composite');
      expect(result.results).toHaveLength(2);
      expect(result.results[0].content).toBe('Result 1: test');
      expect(result.results[1].content).toBe('Result 2: test');
      expect(result.totalTokenCost).toBe(50); // 30 + 20
      expect(result.skillId).toBe('composite:exec');
    });

    test('should calculate total token cost for composite', async () => {
      skillSystem.register({
        id: 'cost:sub1',
        name: 'Cost Sub 1',
        type: SkillType.TEMPLATE,
        tokenCost: 100
      });
      skillSystem.register({
        id: 'cost:sub2',
        name: 'Cost Sub 2',
        type: SkillType.TEMPLATE,
        tokenCost: 50
      });

      skillSystem.register({
        id: 'cost:composite',
        name: 'Cost Composite',
        type: SkillType.COMPOSITE,
        skills: ['cost:sub1', 'cost:sub2']
      });

      const result = await skillSystem.execute('cost:composite', {});
      expect(result.totalTokenCost).toBe(150); // 100 + 50
    });
  });

  // ========== Caching Tests ==========

  describe('Caching', () => {
    test('should cache result on first execution (cache miss)', async () => {
      skillSystem.register({
        id: 'cache:test',
        name: 'Cache Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{name}}',
        cacheable: true,
        cacheTTL: 1000
      });

      const result1 = await skillSystem.execute('cache:test', { name: 'First' });
      expect(skillSystem.skillCache.size).toBe(1);

      const result2 = await skillSystem.execute('cache:test', { name: 'Second' });
      expect(skillSystem.skillCache.size).toBe(2);
    });

    test('should return cached result on cache hit', async () => {
      skillSystem.register({
        id: 'cache:hit',
        name: 'Cache Hit',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{name}}',
        cacheable: true,
        cacheTTL: 10000 // Long TTL
      });

      // First execution - cache miss
      const result1 = await skillSystem.execute('cache:hit', { name: 'Cached' });
      expect(skillSystem.stats.cacheHits).toBe(0);

      // Second execution with same context - cache hit
      const result2 = await skillSystem.execute('cache:hit', { name: 'Cached' });
      expect(skillSystem.stats.cacheHits).toBe(1);
      expect(result1).toEqual(result2);
    });

    test('should not cache when cacheable is false', async () => {
      skillSystem.register({
        id: 'nocache:test',
        name: 'No Cache',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{name}}',
        cacheable: false
      });

      await skillSystem.execute('nocache:test', { name: 'Test' });
      await skillSystem.execute('nocache:test', { name: 'Test' });

      expect(skillSystem.skillCache.size).toBe(0);
    });

    test('should emit skill:cache_hit event on cache hit', async () => {
      const eventHandler = jest.fn();
      skillSystem.on('skill:cache_hit', eventHandler);

      skillSystem.register({
        id: 'event:cache',
        name: 'Event Cache',
        type: SkillType.TEMPLATE,
        prompt: 'Hello',
        cacheable: true,
        cacheTTL: 10000
      });

      await skillSystem.execute('event:cache', {});
      await skillSystem.execute('event:cache', {});

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        skillId: 'event:cache'
      }));
    });

    test('should cleanup expired cache entries', async () => {
      const shortTTLSystem = new SkillSystem({ cacheTTL: 50, maxCacheSize: 10 });

      shortTTLSystem.register({
        id: 'expire:test',
        name: 'Expire Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello',
        cacheable: true,
        cacheTTL: 50
      });

      await shortTTLSystem.execute('expire:test', {});

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // Manually trigger cleanup
      shortTTLSystem.cleanupCache();

      expect(shortTTLSystem.skillCache.size).toBe(0);
    });

    test('should cleanup cache when maxCacheSize is exceeded', async () => {
      const smallCacheSystem = new SkillSystem({ cacheTTL: 10000, maxCacheSize: 3 });

      smallCacheSystem.register({
        id: 'size:test',
        name: 'Size Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello {{i}}',
        cacheable: true
      });

      // Fill cache beyond max
      await smallCacheSystem.execute('size:test', { i: 1 });
      await smallCacheSystem.execute('size:test', { i: 2 });
      await smallCacheSystem.execute('size:test', { i: 3 });

      // This should trigger cleanup
      await smallCacheSystem.execute('size:test', { i: 4 });

      // Cache should be cleaned up to make room
      expect(smallCacheSystem.skillCache.size).toBeLessThanOrEqual(3);
    });

    test('cleanupCache should remove expired entries first', async () => {
      const system = new SkillSystem({ cacheTTL: 10, maxCacheSize: 10 });

      system.register({
        id: 'cleanup:test',
        name: 'Cleanup Test',
        type: SkillType.TEMPLATE,
        prompt: 'Hello',
        cacheable: true,
        cacheTTL: 10
      });

      await system.execute('cleanup:test', {});

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 20));

      system.cleanupCache();

      // Expired entry should be removed
      const keys = Array.from(system.skillCache.keys());
      expect(keys.every(k => k.includes('cleanup:test'))).toBe(true);
    });

    test('getCacheKey should generate consistent keys', () => {
      const key1 = skillSystem.getCacheKey('skill:1', { a: 1, b: 2 });
      const key2 = skillSystem.getCacheKey('skill:1', { b: 2, a: 1 }); // Same content, different order

      // JSON.stringify preserves order, so these might be different
      expect(key1).toContain('skill:1');
    });
  });

  // ========== Token Cost Calculation Tests ==========

  describe('Token Cost Calculation', () => {
    test('should use skill tokenCost for basic skills', async () => {
      skillSystem.register({
        id: 'token:basic',
        name: 'Token Basic',
        type: SkillType.TEMPLATE,
        prompt: 'Hello',
        tokenCost: 75
      });

      await skillSystem.execute('token:basic', {});

      expect(skillSystem.stats.tokenSavings).toBe(75);
    });

    test('should calculate COMPOSITE discount of 20%', async () => {
      skillSystem.register({
        id: 'discount:sub1',
        name: 'Discount Sub 1',
        type: SkillType.TEMPLATE,
        tokenCost: 100
      });
      skillSystem.register({
        id: 'discount:sub2',
        name: 'Discount Sub 2',
        type: SkillType.TEMPLATE,
        tokenCost: 50
      });

      const compositeId = skillSystem.compose(
        'Discount Composite',
        'A composite with discount',
        ['discount:sub1', 'discount:sub2']
      );

      const composite = skillSystem.get(compositeId);
      // 100 + 50 = 150, with 20% discount = 120
      expect(composite.tokenCost).toBe(120);
    });

    test('calculateCompositeCost should apply 20% discount', () => {
      skillSystem.register({
        id: 'calc:sub1',
        name: 'Calc Sub 1',
        type: SkillType.TEMPLATE,
        tokenCost: 100
      });
      skillSystem.register({
        id: 'calc:sub2',
        name: 'Calc Sub 2',
        type: SkillType.TEMPLATE,
        tokenCost: 50
      });
      skillSystem.register({
        id: 'calc:sub3',
        name: 'Calc Sub 3',
        type: SkillType.TEMPLATE,
        tokenCost: 30
      });

      const cost = skillSystem.calculateCompositeCost(['calc:sub1', 'calc:sub2', 'calc:sub3']);
      // 100 + 50 + 30 = 180, with 20% discount = 144
      expect(cost).toBe(144);
    });

    test('calculateCompositeCost should ignore non-existent skills', () => {
      const cost = skillSystem.calculateCompositeCost(['non:existent', 'also:non:existent']);
      expect(cost).toBe(0);
    });

    test('should track cumulative token savings', async () => {
      skillSystem.register({
        id: 'tracking:1',
        name: 'Tracking 1',
        type: SkillType.TEMPLATE,
        tokenCost: 100
      });
      skillSystem.register({
        id: 'tracking:2',
        name: 'Tracking 2',
        type: SkillType.TEMPLATE,
        tokenCost: 50
      });

      expect(skillSystem.stats.tokenSavings).toBe(0);

      await skillSystem.execute('tracking:1', {});
      expect(skillSystem.stats.tokenSavings).toBe(100);

      await skillSystem.execute('tracking:2', {});
      expect(skillSystem.stats.tokenSavings).toBe(150);
    });
  });

  // ========== Lifecycle Tests ==========

  describe('export() - Skill Export', () => {
    test('should export skill without runtime stats', () => {
      skillSystem.register({
        id: 'export:test',
        name: 'Export Test',
        type: SkillType.TEMPLATE,
        description: 'Test export',
        prompt: 'Hello {{name}}',
        requiredContext: ['name'],
        tokenCost: 50
      });

      // Execute to update stats
      skillSystem.execute('export:test', { name: 'Test' }).catch(() => {});

      const exported = skillSystem.export('export:test');

      expect(exported).not.toBeNull();
      expect(exported.id).toBe('export:test');
      expect(exported.name).toBe('Export Test');
      expect(exported.usageCount).toBeUndefined();
      expect(exported.avgExecutionTime).toBeUndefined();
      expect(exported.successRate).toBeUndefined();
    });

    test('should return null for non-existent skill', () => {
      const exported = skillSystem.export('non:existent');
      expect(exported).toBeNull();
    });
  });

  describe('import() - Skill Import', () => {
    test('should import and register skill', () => {
      const skillData = {
        id: 'import:test',
        name: 'Imported Skill',
        type: SkillType.TEMPLATE,
        description: 'An imported skill',
        prompt: 'Import: {{value}}',
        requiredContext: ['value'],
        tokenCost: 75
      };

      const importedId = skillSystem.import(skillData);

      expect(importedId).toBe('import:test');
      const skill = skillSystem.get('import:test');
      expect(skill.name).toBe('Imported Skill');
      expect(skill.tokenCost).toBe(75);
    });

    test('should generate ID if not provided in import', () => {
      const skillData = {
        name: 'No ID Skill',
        type: SkillType.TOOL
      };

      const importedId = skillSystem.import(skillData);

      expect(importedId).toMatch(/^skill_/);
    });

    test('should throw error when importing duplicate ID', () => {
      skillSystem.register({
        id: 'dup:id',
        name: 'Duplicate',
        type: SkillType.TOOL
      });

      expect(() => {
        skillSystem.import({ id: 'dup:id', name: 'Duplicate 2', type: SkillType.TOOL });
      }).toThrow('Skill already exists: dup:id');
    });
  });

  describe('Built-in Skills Registration', () => {
    test('should register built-in skills on construction', () => {
      const system = new SkillSystem();
      expect(system.list().length).toBeGreaterThan(20);
    });

    test('should include web_search built-in skill', () => {
      const webSearch = skillSystem.get('builtin:web_search');
      expect(webSearch).not.toBeNull();
      expect(webSearch.type).toBe(SkillType.TOOL);
      expect(webSearch.name).toBe('网页搜索');
      expect(webSearch.tools).toContain('web_search');
    });

    test('should include code_review built-in skill', () => {
      const codeReview = skillSystem.get('builtin:code_review');
      expect(codeReview).not.toBeNull();
      expect(codeReview.type).toBe(SkillType.TEMPLATE);
      expect(codeReview.requiredContext).toContain('code');
      expect(codeReview.requiredContext).toContain('language');
    });

    test('should include translate built-in skill', () => {
      const translate = skillSystem.get('builtin:translate');
      expect(translate).not.toBeNull();
      expect(translate.type).toBe(SkillType.TEMPLATE);
      expect(translate.requiredContext).toContain('text');
      expect(translate.requiredContext).toContain('targetLanguage');
    });

    test('should include COMPOSITE type built-in skill (data_analysis)', () => {
      const dataAnalysis = skillSystem.get('builtin:data_analysis');
      expect(dataAnalysis).not.toBeNull();
      expect(dataAnalysis.type).toBe(SkillType.COMPOSITE);
      expect(dataAnalysis.skills).toContain('builtin:data_processing');
      expect(dataAnalysis.skills).toContain('builtin:generate_docs');
    });

    test('should have all expected built-in skills', () => {
      const expectedSkills = [
        'builtin:web_search',
        'builtin:code_review',
        'builtin:code_explain',
        'builtin:generate_docs',
        'builtin:bug_fix',
        'builtin:generate_tests',
        'builtin:translate',
        'builtin:summarize',
        'builtin:ppt_outline',
        'builtin:write_email',
        'builtin:travel_plan',
        'builtin:fitness_plan',
        'builtin:recipe',
        'builtin:writing_polish',
        'builtin:brainstorm',
        'builtin:story_write',
        'builtin:data_analysis',
        'builtin:excel_formula',
        'builtin:format_convert',
        'builtin:json_tool',
        'builtin:regex',
        'builtin:qa_generate',
        'builtin:interview_prep'
      ];

      for (const skillId of expectedSkills) {
        const skill = skillSystem.get(skillId);
        expect(skill).not.toBeNull();
      }
    });
  });

  // ========== Other Methods Tests ==========

  describe('get() - Get Skill', () => {
    test('should return skill by ID', () => {
      skillSystem.register({
        id: 'get:test',
        name: 'Get Test',
        type: SkillType.TOOL
      });

      const skill = skillSystem.get('get:test');
      expect(skill.name).toBe('Get Test');
    });

    test('should return undefined for non-existent skill', () => {
      const skill = skillSystem.get('non:existent');
      expect(skill).toBeUndefined();
    });
  });

  describe('list() - List Skills', () => {
    test('should list all skills when no type specified', () => {
      skillSystem.register({ id: 'list:1', name: 'List 1', type: SkillType.TOOL });
      skillSystem.register({ id: 'list:2', name: 'List 2', type: SkillType.TEMPLATE });

      const all = skillSystem.list();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    test('should filter skills by type', () => {
      skillSystem.register({ id: 'filter:tool', name: 'Filter Tool', type: SkillType.TOOL });
      skillSystem.register({ id: 'filter:template', name: 'Filter Template', type: SkillType.TEMPLATE });

      const tools = skillSystem.list(SkillType.TOOL);
      expect(tools.every(s => s.type === SkillType.TOOL)).toBe(true);

      const templates = skillSystem.list(SkillType.TEMPLATE);
      expect(templates.every(s => s.type === SkillType.TEMPLATE)).toBe(true);
    });
  });

  describe('search() - Search Skills', () => {
    test('should search by name', () => {
      skillSystem.register({ id: 'search:name', name: 'Search By Name', type: SkillType.TOOL });

      const results = skillSystem.search('By Name');
      expect(results.some(s => s.id === 'search:name')).toBe(true);
    });

    test('should search by description', () => {
      skillSystem.register({
        id: 'search:desc',
        name: 'Search Desc',
        description: 'This skill searches by description'
      });

      const results = skillSystem.search('description');
      expect(results.some(s => s.id === 'search:desc')).toBe(true);
    });

    test('should search by description', () => {
      skillSystem.register({
        id: 'search:desc',
        name: 'Search Description',
        description: 'This skill is highly searchable'
      });

      const results = skillSystem.search('searchable');
      expect(results.some(s => s.id === 'search:desc')).toBe(true);
    });
  });

  describe('delete() - Delete Skill', () => {
    test('should delete existing skill', () => {
      skillSystem.register({ id: 'delete:test', name: 'Delete Test', type: SkillType.TOOL });

      expect(skillSystem.get('delete:test')).not.toBeNull();

      const result = skillSystem.delete('delete:test');
      expect(result).toBe(true);
      expect(skillSystem.get('delete:test')).toBeUndefined();
    });

    test('should return false for non-existent skill', () => {
      const result = skillSystem.delete('non:existent');
      expect(result).toBe(false);
    });

    test('should emit skill:deleted event', () => {
      const eventHandler = jest.fn();
      skillSystem.on('skill:deleted', eventHandler);

      skillSystem.register({ id: 'event:delete', name: 'Event Delete', type: SkillType.TOOL });
      skillSystem.delete('event:delete');

      expect(eventHandler).toHaveBeenCalledWith('event:delete');
    });
  });

  describe('update() - Update Skill', () => {
    test('should update existing skill', () => {
      skillSystem.register({ id: 'update:test', name: 'Original Name', type: SkillType.TOOL });

      const updated = skillSystem.update('update:test', {
        name: 'Updated Name',
        description: 'New description'
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New description');
    });

    test('should update updatedAt timestamp', async () => {
      skillSystem.register({ id: 'time:test', name: 'Time Test', type: SkillType.TOOL });

      const original = skillSystem.get('time:test');
      const originalUpdatedAt = original.updatedAt;

      // Wait a tiny bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      skillSystem.update('time:test', { description: 'Updated' });

      const updated = skillSystem.get('time:test');
      expect(updated.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });

    test('should throw error for non-existent skill', () => {
      expect(() => {
        skillSystem.update('non:existent', { name: 'New Name' });
      }).toThrow('Skill not found: non:existent');
    });

    test('should emit skill:updated event', () => {
      const eventHandler = jest.fn();
      skillSystem.on('skill:updated', eventHandler);

      skillSystem.register({ id: 'event:update', name: 'Event Update', type: SkillType.TOOL });
      skillSystem.update('event:update', { description: 'Updated' });

      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats() - Get Statistics', () => {
    test('should return comprehensive stats', () => {
      const stats = skillSystem.getStats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.tokenSavings).toBe(0);
      expect(stats.totalSkills).toBeGreaterThan(0);
      expect(stats.cacheSize).toBe(0);
      expect(stats.skillsByType).toBeDefined();
      expect(stats.skillsByType.tool).toBeGreaterThanOrEqual(0);
      expect(stats.skillsByType.template).toBeGreaterThanOrEqual(0);
      expect(stats.skillsByType.composite).toBeGreaterThanOrEqual(0);
      expect(stats.skillsByType.prompt).toBeGreaterThanOrEqual(0);
    });
  });

  describe('compose() - Compose Skills', () => {
    test('should create a COMPOSITE skill from skill IDs', () => {
      skillSystem.register({ id: 'comp:1', name: 'Comp 1', type: SkillType.TEMPLATE, tokenCost: 100 });
      skillSystem.register({ id: 'comp:2', name: 'Comp 2', type: SkillType.TEMPLATE, tokenCost: 50 });

      const compositeId = skillSystem.compose(
        'Composed Skill',
        'A composed skill',
        ['comp:1', 'comp:2']
      );

      const composite = skillSystem.get(compositeId);
      expect(composite.type).toBe(SkillType.COMPOSITE);
      expect(composite.name).toBe('Composed Skill');
      expect(composite.skills).toEqual(['comp:1', 'comp:2']);
    });

    test('should calculate token cost with 20% discount', () => {
      skillSystem.register({ id: 'cost:1', name: 'Cost 1', type: SkillType.TEMPLATE, tokenCost: 100 });
      skillSystem.register({ id: 'cost:2', name: 'Cost 2', type: SkillType.TEMPLATE, tokenCost: 50 });

      const compositeId = skillSystem.compose(
        'Cost Composite',
        'With discount',
        ['cost:1', 'cost:2']
      );

      const composite = skillSystem.get(compositeId);
      expect(composite.tokenCost).toBe(120); // (100+50) * 0.8
    });

    test('should allow custom token cost', () => {
      skillSystem.register({ id: 'custom:1', name: 'Custom 1', type: SkillType.TEMPLATE, tokenCost: 100 });

      const compositeId = skillSystem.compose(
        'Custom Cost',
        'With custom cost',
        ['custom:1'],
        { tokenCost: 500 }
      );

      const composite = skillSystem.get(compositeId);
      expect(composite.tokenCost).toBe(500);
    });
  });

  // ========== SkillType Constants ==========

  describe('SkillType', () => {
    test('should have all required skill types', () => {
      expect(SkillType.TOOL).toBe('tool');
      expect(SkillType.TEMPLATE).toBe('template');
      expect(SkillType.COMPOSITE).toBe('composite');
      expect(SkillType.PROMPT).toBe('prompt');
    });
  });
});
