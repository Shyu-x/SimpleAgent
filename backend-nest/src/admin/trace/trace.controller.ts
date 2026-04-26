import { Controller, Get, Post, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TraceService } from './trace.service';
import { ListTracesDto, CreateTraceDto, ClearTracesDto } from './dto';

@ApiTags('admin-traces')
@Controller('admin/traces')
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  @Get()
  @ApiOperation({ summary: '获取追踪列表' })
  getTraces(@Query() query: ListTracesDto) {
    return {
      success: true,
      data: this.traceService.listTraces(query),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '获取追踪统计' })
  getStats() {
    return {
      success: true,
      data: this.traceService.getStats(),
    };
  }

  @Get(':traceId')
  @ApiOperation({ summary: '获取追踪详情' })
  getTrace(@Param('traceId') traceId: string) {
    return {
      success: true,
      data: this.traceService.getTrace(traceId),
    };
  }

  @Get(':traceId/spans')
  @ApiOperation({ summary: '获取 Span 列表' })
  getSpans(@Param('traceId') traceId: string) {
    return {
      success: true,
      data: this.traceService.getSpans(traceId),
    };
  }

  @Post()
  @ApiOperation({ summary: '创建新追踪' })
  @HttpCode(HttpStatus.CREATED)
  createTrace(@Body() dto: CreateTraceDto) {
    return {
      success: true,
      data: this.traceService.createTrace(dto),
    };
  }

  @Delete()
  @ApiOperation({ summary: '清空追踪记录' })
  clearTraces(@Query() query: ClearTracesDto) {
    return {
      success: true,
      data: this.traceService.clearTraces(query.password),
    };
  }
}
