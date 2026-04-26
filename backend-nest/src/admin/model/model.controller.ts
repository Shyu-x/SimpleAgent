import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ModelService } from './model.service';
import { UpdateModelDto } from './dto';

@ApiTags('admin-models')
@Controller('admin/models')
export class ModelController {
  constructor(private readonly modelService: ModelService) {}

  @Get()
  @ApiOperation({ summary: '获取模型列表' })
  getModels() {
    return {
      success: true,
      data: this.modelService.listModels(),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '获取模型统计' })
  getStats() {
    return {
      success: true,
      data: {
        ...this.modelService.getStats(),
        circuitBreakers: this.modelService.getCircuitBreakerStates(),
      },
    };
  }

  @Get(':name')
  @ApiOperation({ summary: '获取指定模型详情' })
  getModel(@Param('name') name: string) {
    return {
      success: true,
      data: this.modelService.getModel(name),
    };
  }

  @Put(':name')
  @ApiOperation({ summary: '更新模型配置' })
  updateModel(@Param('name') name: string, @Body() dto: UpdateModelDto) {
    return {
      success: true,
      data: this.modelService.updateModel(name, dto),
    };
  }

  @Patch(':name')
  @ApiOperation({ summary: '更新模型启用状态' })
  patchModel(@Param('name') name: string, @Body() dto: { enabled?: boolean }) {
    return {
      success: true,
      data: this.modelService.patchModel(name, dto),
    };
  }

  @Post(':name/circuit-breaker')
  @ApiOperation({ summary: '重置熔断器' })
  @HttpCode(HttpStatus.OK)
  resetCircuitBreaker(@Param('name') name: string) {
    return {
      success: true,
      data: this.modelService.resetCircuitBreaker(name),
    };
  }

  @Post(':name/health')
  @ApiOperation({ summary: '健康检查' })
  @HttpCode(HttpStatus.OK)
  async healthCheck(@Param('name') name: string) {
    return {
      success: true,
      data: await this.modelService.healthCheck(name),
    };
  }

  @Post('health-all')
  @ApiOperation({ summary: '批量健康检查' })
  @HttpCode(HttpStatus.OK)
  async healthCheckAll() {
    return {
      success: true,
      data: await this.modelService.healthCheckAll(),
    };
  }
}
