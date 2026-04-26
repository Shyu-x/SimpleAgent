import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MissionService, TaskStatus, AgentStatus } from './mission.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CreateAgentDto,
  UpdateAgentDto,
  CreateEventDto,
} from './dto';

@ApiTags('mission')
@ApiBearerAuth()
@Controller('mission')
export class MissionController {
  constructor(private readonly missionService: MissionService) {}

  // Task endpoints
  @Post('tasks')
  @ApiOperation({ summary: '创建任务' })
  createTask(@Body() dto: CreateTaskDto) {
    if (!dto.name) {
      return { error: { message: 'name is required', type: 'validation_error' } };
    }
    const task = this.missionService.createTask(dto);
    return { success: true, task };
  }

  @Get('tasks')
  @ApiOperation({ summary: '获取任务列表' })
  getTasks(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('agentId') agentId?: string,
  ) {
    const result = this.missionService.getTasks({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status,
      priority,
      agentId,
    });
    return { success: true, tasks: result.tasks, pagination: result.pagination };
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: '获取任务详情' })
  getTask(@Param('id') id: string) {
    try {
      const task = this.missionService.getTask(id);
      return { success: true, task };
    } catch (error) {
      return { error: { message: 'Task not found', type: 'not_found' } };
    }
  }

  @Put('tasks/:id')
  @ApiOperation({ summary: '更新任务' })
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    try {
      const task = this.missionService.updateTask(id, dto);
      return { success: true, task };
    } catch (error) {
      return { error: { message: error.message, type: 'not_found' } };
    }
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: '删除任务' })
  deleteTask(@Param('id') id: string) {
    try {
      this.missionService.deleteTask(id);
      return { success: true, message: 'Task deleted' };
    } catch (error) {
      return { error: { message: 'Task not found', type: 'not_found' } };
    }
  }

  @Post('tasks/:id/execute')
  @ApiOperation({ summary: '执行任务' })
  executeTask(@Param('id') id: string) {
    try {
      const task = this.missionService.executeTask(id);
      return { success: true, task };
    } catch (error) {
      return { error: { message: error.message, type: 'invalid_state' } };
    }
  }

  @Post('tasks/:id/cancel')
  @ApiOperation({ summary: '取消任务' })
  cancelTask(@Param('id') id: string) {
    try {
      const task = this.missionService.cancelTask(id);
      return { success: true, task };
    } catch (error) {
      return { error: { message: error.message, type: 'invalid_state' } };
    }
  }

  // Agent endpoints
  @Get('agents')
  @ApiOperation({ summary: '获取Agent列表' })
  getAgents(@Query('status') status?: string, @Query('role') role?: string) {
    const agents = this.missionService.getAgents({ status, role });
    return { success: true, agents };
  }

  @Post('agents')
  @ApiOperation({ summary: '创建/注册Agent' })
  createAgent(@Body() dto: CreateAgentDto) {
    if (!dto.name) {
      return { error: { message: 'name is required', type: 'validation_error' } };
    }
    const agent = this.missionService.createAgent(dto);
    return { success: true, agent };
  }

  @Put('agents/:id')
  @ApiOperation({ summary: '更新Agent状态' })
  updateAgent(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    try {
      const agent = this.missionService.updateAgent(id, {
        ...dto,
        status: dto.status as AgentStatus
      });
      return { success: true, agent };
    } catch (error) {
      return { error: { message: 'Agent not found', type: 'not_found' } };
    }
  }

  @Delete('agents/:id')
  @ApiOperation({ summary: '删除Agent' })
  deleteAgent(@Param('id') id: string) {
    try {
      this.missionService.deleteAgent(id);
      return { success: true, message: 'Agent deleted' };
    } catch (error) {
      return { error: { message: 'Agent not found', type: 'not_found' } };
    }
  }

  // Stats endpoint
  @Get('stats')
  @ApiOperation({ summary: '获取任务统计' })
  getStats() {
    const stats = this.missionService.getStats();
    return { success: true, stats };
  }

  // Event endpoints
  @Get('events')
  @ApiOperation({ summary: '获取事件列表' })
  getEvents(@Query('limit') limit?: string) {
    const events = this.missionService.getEvents(limit ? parseInt(limit) : 50);
    return { success: true, events };
  }

  @Post('events')
  @ApiOperation({ summary: '添加事件' })
  createEvent(@Body() dto: CreateEventDto) {
    if (!dto.message) {
      return { error: { message: 'message is required', type: 'validation_error' } };
    }
    const event = this.missionService.addEvent(dto);
    return { success: true, event };
  }

  @Post('broadcast')
  @ApiOperation({ summary: '广播消息' })
  broadcast(@Body() body: { message: string; data?: any }) {
    if (!body.message) {
      return { error: { message: 'message is required', type: 'validation_error' } };
    }
    const event = this.missionService.broadcast(body.message, body.data);
    return { success: true, event };
  }
}
