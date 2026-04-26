import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { HitlService } from './hitl.service';
import {
  CreateCheckpointDto,
  ApproveCheckpointDto,
  RejectCheckpointDto,
  WaitCheckpointDto,
  ConfirmDto,
  HistoryQueryDto,
  CheckpointStatus,
  CheckpointType,
} from './dto/hitl.dto';

@ApiTags('hitl')
@Controller('hitl')
export class HitlController {
  constructor(private readonly hitlService: HitlService) {}

  @Post('checkpoint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建检查点' })
  @ApiResponse({ status: 200, description: '检查点创建成功' })
  createCheckpoint(@Body() dto: CreateCheckpointDto) {
    if (!dto.title) {
      return HttpStatus.BAD_REQUEST;
    }

    try {
      const checkpoint = this.hitlService.createCheckpoint({
        type: dto.type || CheckpointType.DECISION,
        title: dto.title,
        description: dto.description,
        context: dto.context,
        options: dto.options || [],
        defaultOption: dto.defaultOption,
        timeout: dto.timeout,
        required: dto.isRequired,
      });

      return {
        success: true,
        checkpoint: this.toSummary(checkpoint),
      };
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Get('pending')
  @ApiOperation({ summary: '获取待处理检查点列表' })
  @ApiResponse({ status: 200, description: '待处理检查点列表' })
  getPendingCheckpoints() {
    try {
      const pending = this.hitlService.getPendingCheckpoints();
      return {
        success: true,
        checkpoints: pending.map((cp) => this.toSummary(cp)),
        count: pending.length,
      };
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Get('checkpoint/:id')
  @ApiOperation({ summary: '获取检查点详情' })
  @ApiParam({ name: 'id', description: '检查点ID' })
  @ApiResponse({ status: 200, description: '检查点详情' })
  @ApiResponse({ status: 404, description: '检查点未找到' })
  getCheckpoint(@Param('id') id: string) {
    let checkpoint = this.hitlService.getCheckpoint(id);
    if (!checkpoint) {
      checkpoint = this.hitlService.findInHistory(id);
    }

    if (!checkpoint) {
      return HttpStatus.NOT_FOUND;
    }

    return {
      success: true,
      checkpoint: this.toSummary(checkpoint),
    };
  }

  @Post('checkpoint/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批准检查点' })
  @ApiParam({ name: 'id', description: '检查点ID' })
  @ApiResponse({ status: 200, description: '批准成功' })
  approveCheckpoint(
    @Param('id') id: string,
    @Body() dto: ApproveCheckpointDto,
  ) {
    try {
      const result = this.hitlService.approveCheckpoint(
        id,
        dto.option,
        dto.userId || 'user',
        dto.comment || '',
      );
      return result;
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Post('checkpoint/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '拒绝检查点' })
  @ApiParam({ name: 'id', description: '检查点ID' })
  @ApiResponse({ status: 200, description: '拒绝成功' })
  rejectCheckpoint(@Param('id') id: string, @Body() dto: RejectCheckpointDto) {
    try {
      const result = this.hitlService.rejectCheckpoint(
        id,
        dto.reason || '',
        dto.userId || 'user',
      );
      return result;
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Post('checkpoint/:id/wait')
  @ApiOperation({ summary: '等待检查点响应' })
  @ApiParam({ name: 'id', description: '检查点ID' })
  @ApiResponse({ status: 200, description: '等待结果' })
  async waitForCheckpoint(
    @Param('id') id: string,
    @Body() dto: WaitCheckpointDto,
  ) {
    try {
      const result = await this.hitlService.waitForCheckpoint(id, dto.timeout);
      return result;
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Post('confirm')
  @ApiOperation({ summary: '创建并等待确认' })
  @ApiResponse({ status: 200, description: '确认结果' })
  async confirm(@Body() dto: ConfirmDto) {
    if (!dto.title) {
      return HttpStatus.BAD_REQUEST;
    }

    try {
      const result = await this.hitlService.requestConfirmation({
        type: dto.type || CheckpointType.DECISION,
        title: dto.title,
        description: dto.description,
        context: dto.context,
        options: dto.options || [],
        timeout: dto.timeout,
        required: dto.isRequired,
      });

      return result;
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Get('history')
  @ApiOperation({ summary: '获取历史记录' })
  @ApiResponse({ status: 200, description: '历史记录列表' })
  getHistory(@Query() query: HistoryQueryDto) {
    try {
      const history = this.hitlService.getHistory(query.limit || 50);
      return {
        success: true,
        history: history.map((cp) => this.toSummary(cp)),
        count: history.length,
      };
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Get('stats')
  @ApiOperation({ summary: '获取统计信息' })
  @ApiResponse({ status: 200, description: '统计信息' })
  getStats() {
    try {
      const stats = this.hitlService.getStats();
      return {
        success: true,
        stats,
      };
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清除所有待处理检查点' })
  @ApiResponse({ status: 200, description: '清除成功' })
  clearPending() {
    try {
      this.hitlService.clearPending();
      return {
        success: true,
        message: 'All pending checkpoints cleared',
      };
    } catch (error) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  @Get('types')
  @ApiOperation({ summary: '获取检查点类型' })
  @ApiResponse({ status: 200, description: '类型列表' })
  getTypes() {
    return {
      success: true,
      types: Object.values(CheckpointType),
      statuses: Object.values(CheckpointStatus),
    };
  }

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  @ApiResponse({ status: 200, description: '健康状态' })
  health() {
    const stats = this.hitlService.getStats();
    return {
      status: 'ok',
      service: 'human-in-the-loop',
      pending: stats.pending,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('status')
  @ApiOperation({ summary: '状态检查' })
  @ApiResponse({ status: 200, description: '状态信息' })
  status() {
    const stats = this.hitlService.getStats();
    return {
      status: 'ok',
      service: 'human-in-the-loop',
      pending: stats.pending,
      timestamp: new Date().toISOString(),
    };
  }

  private toSummary(checkpoint: any) {
    return {
      id: checkpoint.id,
      type: checkpoint.type,
      title: checkpoint.title,
      description: checkpoint.description,
      status: checkpoint.status,
      createdAt: checkpoint.createdAt,
      respondedAt: checkpoint.respondedAt,
      response: checkpoint.response,
    };
  }
}
