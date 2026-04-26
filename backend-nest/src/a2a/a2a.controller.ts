import {
  Controller,
  Get,
  Post,
  Delete,
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
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { A2AService } from './a2a.service';
import {
  RegisterAgentDto,
  SendMessageDto,
  ReceiveMessageQueryDto,
  PollMessageQueryDto,
  AckMessageDto,
  TaskResultDto,
  ProgressUpdateDto,
  StatusSyncDto,
  TaskQueryDto,
  CollaborateDto,
  BatchTaskDefinitionDto,
  CoordinationMode,
  A2AMessageType,
} from './dto/a2a.dto';

@ApiTags('a2a')
@Controller('a2a')
export class A2AController {
  constructor(private readonly a2aService: A2AService) {}

  @Get('status')
  @ApiOperation({ summary: '获取A2A服务状态' })
  @ApiResponse({ status: 200, description: '服务状态信息' })
  getStatus() {
    return {
      success: true,
      ...this.a2aService.getStats(),
    };
  }

  @Get('agents')
  @ApiOperation({ summary: '获取在线Agent列表' })
  @ApiResponse({ status: 200, description: 'Agent列表' })
  listAgents() {
    const agents = this.a2aService.listAgents();
    return {
      success: true,
      agents,
      count: agents.length,
    };
  }

  @Get('agents/:agentId')
  @ApiOperation({ summary: '获取单个Agent信息' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: 'Agent信息' })
  @ApiResponse({ status: 404, description: 'Agent未找到' })
  getAgent(@Param('agentId') agentId: string) {
    const agent = this.a2aService.getAgent(agentId);
    if (!agent) {
      return HttpStatus.NOT_FOUND;
    }
    return { success: true, agent };
  }

  @Post('agents/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册Agent' })
  @ApiBody({ type: RegisterAgentDto })
  @ApiResponse({ status: 200, description: 'Agent注册成功' })
  registerAgent(@Body() dto: RegisterAgentDto) {
    if (!dto.id) {
      return HttpStatus.BAD_REQUEST;
    }
    const agent = this.a2aService.registerAgent({
      id: dto.id,
      name: dto.name,
      type: dto.type,
      endpoint: dto.endpoint,
      capabilities: dto.capabilities,
      metadata: dto.metadata,
    });
    return { success: true, agent };
  }

  @Post('agents/:agentId/unregister')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注销Agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: 'Agent注销成功' })
  unregisterAgent(@Param('agentId') agentId: string) {
    this.a2aService.unregisterAgent(agentId);
    return { success: true, message: 'Agent unregistered' };
  }

  @Post('agents/:agentId/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agent心跳' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: '心跳成功' })
  agentHeartbeat(@Param('agentId') agentId: string) {
    this.a2aService.agentHeartbeat(agentId);
    return { success: true, timestamp: Date.now() };
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送消息给其他Agent' })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({ status: 200, description: '消息发送成功' })
  sendMessage(@Body() dto: SendMessageDto) {
    if (!dto.from || !dto.to) {
      return HttpStatus.BAD_REQUEST;
    }

    // Handle task delegation
    if (dto.type === 'task.delegate') {
      const result = this.a2aService.delegateTask({
        from: dto.from,
        to: dto.to,
        title: dto.payload?.title || 'Untitled Task',
        description: dto.payload?.description || '',
        input: dto.payload?.input || dto.payload || {},
        priority: dto.priority || 0,
        tags: dto.payload?.tags || [],
        metadata: dto.payload?.metadata || {},
        timeout: dto.timeout || 5 * 60 * 1000,
      });
      return result;
    }

    // Regular message
    const sendResult = this.a2aService.sendMessage({
      type: dto.type,
      from: dto.from,
      to: dto.to,
      taskId: dto.taskId,
      payload: dto.payload,
      priority: dto.priority,
      timeout: dto.timeout,
    });

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
    };
  }

  @Get('receive')
  @ApiOperation({ summary: '接收其他Agent的消息' })
  @ApiResponse({ status: 200, description: '消息列表' })
  receiveMessages(@Query() query: ReceiveMessageQueryDto) {
    if (!query.agentId) {
      return HttpStatus.BAD_REQUEST;
    }

    const messages = this.a2aService.receiveMessages(query.agentId, {
      limit: query.limit || 50,
      includeExpired: false,
      clearReceived: query.clear,
    });

    this.a2aService.agentHeartbeat(query.agentId);

    return {
      success: true,
      messages,
      count: messages.length,
      unreadCount: this.a2aService.getUnreadCount(query.agentId),
    };
  }

  @Get('poll')
  @ApiOperation({ summary: '轮询接收消息' })
  @ApiResponse({ status: 200, description: '消息列表' })
  async pollMessages(@Query() query: PollMessageQueryDto) {
    if (!query.agentId) {
      return HttpStatus.BAD_REQUEST;
    }

    this.a2aService.agentHeartbeat(query.agentId);

    const maxWait = query.timeout || 30000;
    const pollInterval = 1000;
    let waited = 0;

    const checkMessages = () => {
      const messages = this.a2aService.receiveMessages(query.agentId, {
        limit: 50,
        clearReceived: true,
      });

      if (messages.length > 0 || waited >= maxWait) {
        return {
          success: true,
          messages,
          count: messages.length,
          waited,
          timeout: waited >= maxWait,
        };
      }

      waited += pollInterval;
      return null;
    };

    // Simple polling with setTimeout would require async handling
    // For now, return immediately
    return checkMessages();
  }

  @Post('result/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '返回任务结果' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiBody({ type: TaskResultDto })
  @ApiResponse({ status: 200, description: '结果返回成功' })
  returnResult(@Param('taskId') taskId: string, @Body() dto: TaskResultDto) {
    if (!dto.result) {
      return HttpStatus.BAD_REQUEST;
    }

    return this.a2aService.returnResult(
      taskId,
      dto.result,
      dto.status,
      dto.metadata,
    );
  }

  @Post('progress/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送进度更新' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiBody({ type: ProgressUpdateDto })
  @ApiResponse({ status: 200, description: '进度更新成功' })
  sendProgress(@Param('taskId') taskId: string, @Body() dto: ProgressUpdateDto) {
    if (dto.progress === undefined) {
      return HttpStatus.BAD_REQUEST;
    }

    return this.a2aService.sendProgress(taskId, dto.progress, dto.metadata);
  }

  @Post('status/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '同步状态' })
  @ApiBody({ type: StatusSyncDto })
  @ApiResponse({ status: 200, description: '状态同步成功' })
  syncStatus(@Body() dto: StatusSyncDto) {
    if (!dto.agentId) {
      return HttpStatus.BAD_REQUEST;
    }

    return this.a2aService.syncStatus(dto.agentId, dto.status, dto.metadata);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: '获取任务状态' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiResponse({ status: 200, description: '任务信息' })
  @ApiResponse({ status: 404, description: '任务未找到' })
  getTaskStatus(@Param('taskId') taskId: string) {
    const task = this.a2aService.getTaskStatus(taskId);
    if (!task) {
      return HttpStatus.NOT_FOUND;
    }
    return { success: true, task };
  }

  @Get('tasks')
  @ApiOperation({ summary: '列出任务' })
  @ApiResponse({ status: 200, description: '任务列表' })
  listTasks(@Query() query: TaskQueryDto) {
    const tasks = this.a2aService.listTasks({
      status: query.status,
      from: query.from,
      to: query.to,
      limit: query.limit,
    });
    return { success: true, tasks, count: tasks.length };
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消任务' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiResponse({ status: 200, description: '任务取消成功' })
  cancelTask(@Param('taskId') taskId: string) {
    return this.a2aService.cancelTask(taskId);
  }

  @Get('unread/:agentId')
  @ApiOperation({ summary: '获取未读消息数' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({ status: 200, description: '未读消息数' })
  getUnreadCount(@Param('agentId') agentId: string) {
    const count = this.a2aService.getUnreadCount(agentId);
    return { success: true, unreadCount: count };
  }

  @Get('subscribe/:agentId')
  @ApiOperation({ summary: 'SSE实时消息订阅' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async subscribe(@Param('agentId') agentId: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    this.a2aService.agentHeartbeat(agentId);

    const heartbeatInterval = setInterval(() => {
      this.a2aService.agentHeartbeat(agentId);
      res.write(`: heartbeat\n\n`);
    }, 30 * 1000);

    const pollInterval = setInterval(() => {
      const messages = this.a2aService.receiveMessages(agentId, {
        limit: 10,
        clearReceived: true,
      });

      for (const message of messages) {
        res.write(
          `data: ${JSON.stringify({
            event: 'message',
            data: message,
          })}\n\n`,
        );
      }
    }, 2000);

    res.on('close', () => {
      clearInterval(heartbeatInterval);
      clearInterval(pollInterval);
    });

    res.write(
      `data: ${JSON.stringify({ event: 'connected', agentId })}\n\n`,
    );
  }

  @Post('ack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '消息确认（已读）' })
  @ApiBody({ type: AckMessageDto })
  @ApiResponse({ status: 200, description: '确认成功' })
  ackMessages(@Body() dto: AckMessageDto) {
    if (!dto.agentId || !dto.messageIds || !Array.isArray(dto.messageIds)) {
      return HttpStatus.BAD_REQUEST;
    }

    const messages = this.a2aService.receiveMessages(dto.agentId, {
      limit: 1000,
      clearReceived: false,
    });

    const ackedIds: string[] = [];
    const remaining: any[] = [];

    for (const msg of messages) {
      if (dto.messageIds.includes(msg.id)) {
        ackedIds.push(msg.id);
      } else {
        remaining.push(msg);
      }
    }

    return {
      success: true,
      ackedCount: ackedIds.length,
      ackedIds,
    };
  }

  @Post('collaborate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '执行协作任务' })
  @ApiBody({ type: CollaborateDto })
  @ApiResponse({ status: 200, description: '协作执行成功' })
  async collaborate(@Body() dto: CollaborateDto, @Res() res: Response) {
    if (!dto.title) {
      return HttpStatus.BAD_REQUEST;
    }

    const taskList = dto.tasks || dto.subTasks;

    if (!taskList || !Array.isArray(taskList) || taskList.length === 0) {
      return HttpStatus.BAD_REQUEST;
    }

    for (let i = 0; i < taskList.length; i++) {
      const task = taskList[i];
      if (!task.task && !task.prompt && !task.description) {
        return HttpStatus.BAD_REQUEST;
      }
    }

    const coordinationMode = dto.options?.coordinationMode || CoordinationMode.COLLABORATIVE;
    const useSSE = dto.options?.useSSE || false;

    if (useSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(
        `data: ${JSON.stringify({
          event: 'connected',
          title: dto.title,
          coordinationMode,
          taskCount: taskList.length,
        })}\n\n`,
      );
    }

    const collaboration = this.a2aService.createCollaboration(
      dto.title,
      taskList,
      { coordinationMode },
    );

    if (useSSE) {
      res.write(
        `data: ${JSON.stringify({
          event: 'collaboration_started',
          collaborationId: collaboration.id,
        })}\n\n`,
      );

      res.write(
        `data: ${JSON.stringify({
          event: 'collaboration_completed',
          collaborationId: collaboration.id,
        })}\n\n`,
      );

      res.end();
      return;
    }

    return {
      success: true,
      collaboration,
    };
  }

  @Get('collaboration/:taskId')
  @ApiOperation({ summary: '获取协作任务状态' })
  @ApiParam({ name: 'taskId', description: '协作任务ID' })
  @ApiResponse({ status: 200, description: '协作状态' })
  @ApiResponse({ status: 404, description: '协作任务未找到' })
  getCollaborationStatus(@Param('taskId') taskId: string) {
    const status = this.a2aService.getCollaborationStatus(taskId);
    if (!status) {
      return HttpStatus.NOT_FOUND;
    }
    return { success: true, collaboration: status };
  }

  @Get('collaboration/:taskId/result')
  @ApiOperation({ summary: '获取协作任务结果' })
  @ApiParam({ name: 'taskId', description: '协作任务ID' })
  @ApiResponse({ status: 200, description: '协作结果' })
  @ApiResponse({ status: 404, description: '协作任务未找到' })
  getCollaborationResult(@Param('taskId') taskId: string) {
    const result = this.a2aService.getCollaborationResult(taskId);
    if (!result) {
      return HttpStatus.NOT_FOUND;
    }
    return { success: true, ...result };
  }

  @Delete('collaboration/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消协作任务' })
  @ApiParam({ name: 'taskId', description: '协作任务ID' })
  @ApiResponse({ status: 200, description: '取消成功' })
  @ApiResponse({ status: 404, description: '协作任务未找到' })
  cancelCollaboration(@Param('taskId') taskId: string) {
    const cancelled = this.a2aService.cancelCollaboration(taskId);
    if (!cancelled) {
      return HttpStatus.NOT_FOUND;
    }
    return { success: true, message: 'Collaboration cancelled', taskId };
  }

  @Get('collaboration/stats')
  @ApiOperation({ summary: '获取协作统计' })
  @ApiResponse({ status: 200, description: '协作统计' })
  getCollaborationStats() {
    return {
      success: true,
      stats: {
        totalCollaborations: this.a2aService.getStats().totalCollaborations,
      },
    };
  }

  @Post('tasks/define')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建任务定义' })
  @ApiBody({ type: BatchTaskDefinitionDto })
  @ApiResponse({ status: 200, description: '任务定义创建成功' })
  createTaskDefinition(@Body() dto: any) {
    if (!dto.task && !dto.prompt && !dto.description) {
      return HttpStatus.BAD_REQUEST;
    }

    const task = this.a2aService.delegateTask({
      from: 'system',
      to: dto.agentName || 'unknown',
      title: dto.title || dto.task || dto.prompt || 'Untitled Task',
      description: dto.description || '',
      input: dto.input || {},
      timeout: dto.timeout,
      priority: dto.priority,
    });

    return {
      success: true,
      task,
    };
  }

  @Post('tasks/define/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量创建任务定义' })
  @ApiBody({ type: BatchTaskDefinitionDto })
  @ApiResponse({ status: 200, description: '批量创建成功' })
  batchCreateTaskDefinitions(@Body() dto: BatchTaskDefinitionDto) {
    if (!dto.tasks || !Array.isArray(dto.tasks)) {
      return HttpStatus.BAD_REQUEST;
    }

    const tasks = dto.tasks.map((t) =>
      this.a2aService.delegateTask({
        from: 'system',
        to: t.agentName || 'unknown',
        title: t.title || t.task || t.prompt || 'Untitled Task',
        description: t.description || '',
        input: t.input || {},
        timeout: t.timeout,
        priority: t.priority,
      }),
    );

    return {
      success: true,
      tasks,
      count: tasks.length,
    };
  }

  @Get('coordination/modes')
  @ApiOperation({ summary: '获取协调模式信息' })
  @ApiResponse({ status: 200, description: '协调模式列表' })
  getCoordinationModes() {
    return {
      success: true,
      modes: {
        TEAM_LEADER: {
          value: CoordinationMode.TEAM_LEADER,
          description:
            'One agent orchestrates others, typically the first task in each level',
          useCase: 'Complex hierarchical tasks with clear delegation',
        },
        COLLABORATIVE: {
          value: CoordinationMode.COLLABORATIVE,
          description:
            'Agents share responsibilities and coordinate as peers',
          useCase: 'Tasks requiring parallel specialized work',
        },
        AUTONOMOUS: {
          value: CoordinationMode.AUTONOMOUS,
          description: 'Agents work independently with minimal coordination',
          useCase: 'Independent parallel tasks with no dependencies',
        },
      },
    };
  }
}
