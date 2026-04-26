import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ListToolsDto, RegisterToolDto, UpdateToolDto, PatchToolDto, TestToolDto, RecommendToolDto } from './dto';

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  category: string;
  keywords: string[];
  examples: string[];
  enabled: boolean;
  execute?: Function;
}

export interface ToolStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgLatency: number;
  lastCalled: number | null;
}

@Injectable()
export class ToolService {
  private tools: Map<string, Tool> = new Map();
  private toolStats: Map<string, ToolStats> = new Map();

  constructor() {
    this.initBuiltinTools();
  }

  private initBuiltinTools(): void {
    const builtins: Tool[] = [
      {
        name: 'web_search',
        description: '搜索互联网获取最新信息',
        category: 'search',
        keywords: ['搜索', '查找', '查询', 'search'],
        examples: ['搜索最新的AI新闻', '查找Python教程'],
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
        enabled: true,
      },
      {
        name: 'calculator',
        description: '数学计算工具',
        category: 'utility',
        keywords: ['计算', '算术', '数学', 'calculate'],
        examples: ['计算 2+2', '计算 100 * 50'],
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: '数学表达式' },
          },
          required: ['expression'],
        },
        enabled: true,
      },
      {
        name: 'weather',
        description: '查询天气信息',
        category: 'information',
        keywords: ['天气', '温度', 'weather'],
        examples: ['北京天气怎么样', '查询上海的天气'],
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: '城市名称' },
          },
          required: ['city'],
        },
        enabled: true,
      },
    ];

    for (const tool of builtins) {
      this.tools.set(tool.name, tool);
      this.toolStats.set(tool.name, {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        avgLatency: 0,
        lastCalled: null,
      });
    }
  }

  listTools(query: ListToolsDto): any {
    const { category, keyword } = query;
    let tools = Array.from(this.tools.values());

    if (category) {
      tools = tools.filter(t => t.category === category);
    }

    if (keyword) {
      const kw = keyword.toLowerCase();
      tools = tools.filter(t =>
        t.name.toLowerCase().includes(kw) ||
        t.description.toLowerCase().includes(kw) ||
        (t.keywords || []).some(k => k.toLowerCase().includes(kw)),
      );
    }

    const toolsWithStats = tools.map(t => ({
      ...t,
      stats: this.getToolStats(t.name),
    }));

    return {
      tools: toolsWithStats,
      total: toolsWithStats.length,
      categories: [...new Set(tools.map(t => t.category))],
    };
  }

  listCategories(): any {
    const tools = Array.from(this.tools.values());
    const categories = [...new Set(tools.map(t => t.category))];

    return {
      categories: categories.map(cat => ({
        id: cat,
        name: cat,
        icon: '🛠️',
        count: tools.filter(t => t.category === cat).length,
      })),
    };
  }

  listCategoriesAsArray(): any {
    const tools = Array.from(this.tools.values());
    const categories = [...new Set(tools.map(t => t.category || 'general'))];

    return { categories };
  }

  listByCategory(): any {
    const tools = Array.from(this.tools.values());
    const byCategory: Record<string, any[]> = {};

    for (const tool of tools) {
      const cat = tool.category || 'general';
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push({
        name: tool.name,
        description: tool.description,
        keywords: tool.keywords,
        stats: this.getToolStats(tool.name),
      });
    }

    return {
      categories: Object.keys(byCategory),
      byCategory,
    };
  }

  getStats(): any {
    const summary: any = {
      totalTools: this.tools.size,
      totalCalls: 0,
      successRate: '0%',
    };

    const allStats = Array.from(this.toolStats.values());
    let totalCalls = 0;
    let successCalls = 0;

    for ( const stats of allStats) {
      totalCalls += stats.totalCalls;
      successCalls += stats.successCalls;
    }

    summary.totalCalls = totalCalls;
    summary.successRate = totalCalls > 0 ? (successCalls / totalCalls * 100).toFixed(2) + '%' : '0%';

    return summary;
  }

  getAllStats(): Record<string, ToolStats> {
    const result: Record<string, ToolStats> = {};
    for (const [name, stats] of this.toolStats) {
      result[name] = stats;
    }
    return result;
  }

  getTool(name: string): any {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`工具 ${name} 不存在`);
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category,
      keywords: tool.keywords,
      examples: tool.examples,
      stats: this.getToolStats(name),
    };
  }

  getToolStats(name: string): ToolStats {
    return this.toolStats.get(name) || {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      avgLatency: 0,
      lastCalled: null,
    };
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  register(dto: RegisterToolDto): any {
    if (!dto.name) {
      throw new Error('工具名称不能为空');
    }

    if (this.tools.has(dto.name)) {
      throw new ConflictException(`工具 ${dto.name} 已存在`);
    }

    const tool: Tool = {
      name: dto.name,
      description: dto.description || '',
      parameters: dto.parameters || {},
      category: dto.category || 'general',
      keywords: dto.keywords || [],
      examples: dto.examples || [],
      enabled: true,
    };

    this.tools.set(tool.name, tool);
    this.toolStats.set(tool.name, {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      avgLatency: 0,
      lastCalled: null,
    });

    return {
      name: tool.name,
      category: tool.category,
      registeredAt: new Date().toISOString(),
    };
  }

  update(name: string, dto: UpdateToolDto): any {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`工具 ${name} 不存在`);
    }

    const updates: Record<string, boolean> = {};

    if (dto.description !== undefined) {
      tool.description = dto.description;
      updates.description = true;
    }
    if (dto.parameters !== undefined) {
      tool.parameters = dto.parameters;
      updates.parameters = true;
    }
    if (dto.category !== undefined) {
      tool.category = dto.category;
      updates.category = true;
    }
    if (dto.keywords !== undefined) {
      tool.keywords = dto.keywords;
      updates.keywords = true;
    }
    if (dto.examples !== undefined) {
      tool.examples = dto.examples;
      updates.examples = true;
    }

    return {
      name,
      updates,
      updatedAt: new Date().toISOString(),
    };
  }

  patch(name: string, dto: PatchToolDto): any {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`工具 ${name} 不存在`);
    }

    if (dto.enabled !== undefined) {
      tool.enabled = dto.enabled;
    }

    return {
      name: tool.name,
      enabled: tool.enabled,
      category: tool.category,
    };
  }

  delete(name: string): any {
    if (!this.tools.has(name)) {
      throw new NotFoundException(`工具 ${name} 不存在`);
    }

    this.tools.delete(name);
    this.toolStats.delete(name);

    return { name, unregistered: true };
  }

  async test(name: string, dto: TestToolDto): Promise<any> {
    if (!this.tools.has(name)) {
      throw new NotFoundException(`工具 ${name} 不存在`);
    }

    const startTime = Date.now();

    try {
      // 模拟工具执行
      const result = {
        success: true,
        output: `模拟执行结果: ${name} with params ${JSON.stringify(dto.params || {})}`,
      };

      const latency = Date.now() - startTime;

      // 更新统计
      const stats = this.toolStats.get(name);
      if (stats) {
        stats.totalCalls++;
        stats.successCalls++;
        stats.lastCalled = Date.now();
      }

      return {
        name,
        params: dto.params || {},
        latency,
        ...result,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      const stats = this.toolStats.get(name);
      if (stats) {
        stats.totalCalls++;
        stats.failedCalls++;
        stats.lastCalled = Date.now();
      }

      throw error;
    }
  }

  recommendTools(dto: RecommendToolDto): any {
    if (!dto.query && !dto.intent) {
      throw new Error('query 或 intent 至少需要一个');
    }

    const tools = Array.from(this.tools.values());
    const recommendations: (Tool & { score: number })[] = [];

    const searchText = (dto.query || dto.intent || '').toLowerCase();

    for (const tool of tools) {
      if (!tool.enabled) continue;

      const score =
        (tool.keywords || []).filter(k => searchText.includes(k.toLowerCase())).length +
        (tool.description.toLowerCase().includes(searchText) ? 1 : 0) +
        (tool.name.toLowerCase().includes(searchText) ? 2 : 0);

      if (score > 0) {
        recommendations.push({ ...tool, score } as any);
      }
    }

    recommendations.sort((a, b: any) => b.score - a.score);

    return {
      query: dto.query,
      intent: dto.intent,
      recommendations: recommendations.slice(0, 5),
    };
  }
}
