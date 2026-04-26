import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { A2AService } from './a2a.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class A2AGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(A2AGateway.name);

  constructor(private readonly a2aService: A2AService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('agent:register')
  handleAgentRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { id: string; name?: string; type?: string },
  ) {
    const agent = this.a2aService.registerAgent({
      id: payload.id,
      name: payload.name,
      type: payload.type,
    });

    client.join(`agent:${payload.id}`);

    return {
      event: 'agent:registered',
      data: { success: true, agent },
    };
  }

  @SubscribeMessage('agent:unregister')
  handleAgentUnregister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string },
  ) {
    this.a2aService.unregisterAgent(payload.agentId);
    client.leave(`agent:${payload.agentId}`);

    return {
      event: 'agent:unregistered',
      data: { success: true },
    };
  }

  @SubscribeMessage('agent:heartbeat')
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string },
  ) {
    this.a2aService.agentHeartbeat(payload.agentId);

    return {
      event: 'agent:heartbeat:ack',
      data: { success: true, timestamp: Date.now() },
    };
  }

  @SubscribeMessage('agent:message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      from: string;
      to: string;
      type?: string;
      payload?: any;
      taskId?: string;
    },
  ) {
    const result = this.a2aService.sendMessage({
      from: payload.from,
      to: payload.to,
      type: payload.type as any,
      payload: payload.payload,
      taskId: payload.taskId,
    });

    this.server.to(`agent:${payload.to}`).emit('agent:message', {
      from: payload.from,
      messageId: result.messageId,
      payload: payload.payload,
      taskId: payload.taskId,
    });

    return {
      event: 'agent:message:sent',
      data: { success: result.success, messageId: result.messageId },
    };
  }

  @SubscribeMessage('agent:receive')
  handleReceive(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string; clear?: boolean },
  ) {
    const messages = this.a2aService.receiveMessages(payload.agentId, {
      limit: 50,
      clearReceived: payload.clear,
    });

    return {
      event: 'agent:messages:received',
      data: { messages, count: messages.length },
    };
  }

  @SubscribeMessage('agent:task:delegate')
  handleTaskDelegate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      from: string;
      to: string;
      title?: string;
      description?: string;
      input?: any;
    },
  ) {
    const task = this.a2aService.delegateTask({
      from: payload.from,
      to: payload.to,
      title: payload.title,
      description: payload.description,
      input: payload.input,
    });

    this.server.to(`agent:${payload.to}`).emit('agent:task:new', {
      taskId: task.id,
      from: payload.from,
      title: task.title,
    });

    return {
      event: 'agent:task:delegated',
      data: { success: true, task },
    };
  }

  @SubscribeMessage('agent:task:progress')
  handleTaskProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { taskId: string; progress: number; metadata?: any },
  ) {
    const result = this.a2aService.sendProgress(
      payload.taskId,
      payload.progress,
      payload.metadata,
    );

    return {
      event: 'agent:task:progress:updated',
      data: result,
    };
  }

  @SubscribeMessage('agent:task:result')
  handleTaskResult(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      taskId: string;
      result: any;
      status?: string;
      metadata?: any;
    },
  ) {
    const result = this.a2aService.returnResult(
      payload.taskId,
      payload.result,
      payload.status as any,
      payload.metadata,
    );

    return {
      event: 'agent:task:result:received',
      data: result,
    };
  }

  @SubscribeMessage('agent:subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string },
  ) {
    client.join(`agent:${payload.agentId}`);

    return {
      event: 'agent:subscribed',
      data: { success: true, agentId: payload.agentId },
    };
  }

  @SubscribeMessage('agent:unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string },
  ) {
    client.leave(`agent:${payload.agentId}`);

    return {
      event: 'agent:unsubscribed',
      data: { success: true, agentId: payload.agentId },
    };
  }

  @SubscribeMessage('collaboration:create')
  handleCollaborationCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { title: string; tasks: any[]; coordinationMode?: string },
  ) {
    const collaboration = this.a2aService.createCollaboration(
      payload.title,
      payload.tasks,
      { coordinationMode: payload.coordinationMode as any },
    );

    return {
      event: 'collaboration:created',
      data: { success: true, collaboration },
    };
  }

  @SubscribeMessage('collaboration:subscribe')
  handleCollaborationSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { collaborationId: string },
  ) {
    client.join(`collab:${payload.collaborationId}`);

    return {
      event: 'collaboration:subscribed',
      data: { success: true },
    };
  }
}
