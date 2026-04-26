import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { SearchService } from './search.service';
import { SearchDto } from './dto';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: '获取搜索服务状态' })
  getStatus() {
    const providers = this.searchService.getEnabledProviders();
    return {
      success: true,
      service: 'search',
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: {
        web: 'POST /api/search/web',
        config: 'GET /api/search/config',
        providers: 'GET /api/search/providers',
        test: 'POST /api/search/test',
        health: 'GET /api/search/health',
      },
      availableProviders: providers.map((p) => p.id),
      defaultProvider: 'jina',
    };
  }

  @Post('web')
  @ApiOperation({ summary: 'Web搜索接口' })
  async searchWeb(@Body() dto: SearchDto, @Res() res: Response) {
    if (!dto.query) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Missing query parameter' },
      });
    }

    const results = await this.searchService.searchWeb(
      dto.query,
      dto.limit || 10,
      dto.source || 'jina',
    );

    if (dto.format === 'markdown') {
      return res.json({
        success: results.success,
        markdown: this.searchService.formatResultsAsMarkdown(results),
        raw: results,
      });
    }

    return res.json(results);
  }

  @Get('config')
  @ApiOperation({ summary: '获取搜索配置' })
  getConfig() {
    const providers = this.searchService.getSearchProviders();
    const enabled = this.searchService.getEnabledProviders();
    return {
      success: true,
      config: {
        sources: providers,
        enabled: enabled.map((p) => p.id),
        defaultSource: 'jina',
        freeSources: providers.filter((p) => !p.requiresKey).map((p) => p.id),
        paidSources: providers.filter((p) => p.requiresKey).map((p) => p.id),
      },
    };
  }

  @Get('providers')
  @ApiOperation({ summary: '获取搜索源详情' })
  getProviders() {
    return {
      success: true,
      providers: this.searchService.getSearchProviders(),
    };
  }

  @Post('test')
  @ApiOperation({ summary: '测试搜索源' })
  async testSearch(@Body() body: { source?: string; query?: string }) {
    const source = body.source || 'jina';
    const query = body.query || 'test';
    const results = await this.searchService.searchWeb(query, 3, source);
    return {
      success: true,
      source,
      results: results.results?.length || 0,
      tested: true,
    };
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    const providers = this.searchService.getEnabledProviders();
    return {
      status: 'ok',
      service: 'search',
      timestamp: new Date().toISOString(),
      providers: providers.map((p) => p.name),
      defaultProvider: 'jina',
    };
  }
}
