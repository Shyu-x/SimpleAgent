import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsObject,
  IsEnum,
  ValidateNested,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum A2AMessageType {
  MESSAGE_SEND = 'message.send',
  TASK_DELEGATE = 'task.delegate',
  TASK_RESULT = 'task.result',
  TASK_PROGRESS = 'task.progress',
  STATUS_SYNC = 'status.sync',
  HEARTBEAT = 'heartbeat',
}

export enum A2ATaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum CoordinationMode {
  TEAM_LEADER = 'team_leader',
  COLLABORATIVE = 'collaborative',
  AUTONOMOUS = 'autonomous',
}

// ============ Agent DTOs ============

export class RegisterAgentDto {
  @ApiProperty({ description: 'Agent ID' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Agent name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Agent type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Agent endpoint' })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({ description: 'Agent capabilities' })
  @IsOptional()
  @IsArray()
  capabilities?: string[];

  @ApiPropertyOptional({ description: 'Agent metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class AgentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional()
  endpoint?: string;

  @ApiProperty()
  capabilities: string[];

  @ApiProperty()
  metadata: Record<string, any>;

  @ApiProperty()
  status: string;

  @ApiProperty()
  lastHeartbeat: number;
}

// ============ Message DTOs ============

export class SendMessageDto {
  @ApiProperty({ description: 'Sender agent ID' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Recipient agent ID' })
  @IsString()
  to: string;

  @ApiPropertyOptional({ enum: A2AMessageType })
  @IsOptional()
  @IsEnum(A2AMessageType)
  type?: A2AMessageType;

  @ApiPropertyOptional({ description: 'Message payload' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Associated task ID' })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ description: 'Message priority' })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ description: 'Message timeout in ms' })
  @IsOptional()
  @IsNumber()
  timeout?: number;
}

export class MessageResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  messageId?: string;

  @ApiPropertyOptional()
  message?: any;
}

export class ReceiveMessageQueryDto {
  @ApiProperty({ description: 'Agent ID to receive messages for' })
  @IsString()
  agentId: string;

  @ApiPropertyOptional({ description: 'Maximum messages to receive' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ description: 'Clear received messages' })
  @IsOptional()
  @IsBoolean()
  clear?: boolean;
}

export class PollMessageQueryDto {
  @ApiProperty({ description: 'Agent ID to poll messages for' })
  @IsString()
  agentId: string;

  @ApiPropertyOptional({ description: 'Max wait time in ms' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(300000)
  timeout?: number;
}

export class AckMessageDto {
  @ApiProperty({ description: 'Agent ID' })
  @IsString()
  agentId: string;

  @ApiProperty({ description: 'Message IDs to acknowledge' })
  @IsArray()
  @IsString({ each: true })
  messageIds: string[];
}

// ============ Task DTOs ============

export class TaskResultDto {
  @ApiProperty({ description: 'Task result data' })
  @IsObject()
  result: Record<string, any>;

  @ApiPropertyOptional({ enum: A2ATaskStatus })
  @IsOptional()
  @IsEnum(A2ATaskStatus)
  status?: A2ATaskStatus;

  @ApiPropertyOptional({ description: 'Result metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class ProgressUpdateDto {
  @ApiProperty({ description: 'Progress value (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;

  @ApiPropertyOptional({ description: 'Progress metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class StatusSyncDto {
  @ApiProperty({ description: 'Agent ID' })
  @IsString()
  agentId: string;

  @ApiPropertyOptional({ description: 'Agent status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Sync metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class TaskQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by from agent' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter by to agent' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Maximum tasks to return' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;
}

// ============ Collaboration DTOs ============

export class TaskDefinitionDto {
  @ApiPropertyOptional({ description: 'Task ID' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Agent name' })
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ description: 'Task type' })
  @IsOptional()
  @IsString()
  taskType?: string;

  @ApiPropertyOptional({ description: 'Task title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Task prompt' })
  @IsOptional()
  @IsString()
  task?: string;

  @ApiPropertyOptional({ description: 'Prompt field (alias for task)' })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional({ description: 'Input data' })
  @IsOptional()
  @IsObject()
  input?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Task dependencies' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({ description: 'Effort level', enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsString()
  effort?: string;

  @ApiPropertyOptional({ description: 'Max turns' })
  @IsOptional()
  @IsNumber()
  maxTurns?: number;

  @ApiPropertyOptional({ description: 'Timeout in ms' })
  @IsOptional()
  @IsNumber()
  timeout?: number;

  @ApiPropertyOptional({ description: 'Success criteria' })
  @IsOptional()
  @IsString()
  successCriteria?: string;

  @ApiPropertyOptional({ description: 'Additional instructions' })
  @IsOptional()
  @IsString()
  additionalInstructions?: string;

  @ApiPropertyOptional({ description: 'Priority' })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ description: 'Tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class CollaborationOptionsDto {
  @ApiPropertyOptional({ enum: CoordinationMode })
  @IsOptional()
  @IsEnum(CoordinationMode)
  coordinationMode?: CoordinationMode;

  @ApiPropertyOptional({ description: 'Use SSE for streaming' })
  @IsOptional()
  @IsBoolean()
  useSSE?: boolean;

  @ApiPropertyOptional({ description: 'Enable hooks' })
  @IsOptional()
  @IsBoolean()
  enableHooks?: boolean;
}

export class CollaborateDto {
  @ApiProperty({ description: 'Collaboration title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Task definitions' })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TaskDefinitionDto)
  tasks?: TaskDefinitionDto[];

  @ApiPropertyOptional({ description: 'Subtasks (legacy format)' })
  @IsOptional()
  @IsArray()
  subTasks?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CollaborationOptionsDto)
  options?: CollaborationOptionsDto;
}

export class BatchTaskDefinitionDto {
  @ApiProperty({ description: 'Task definitions' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskDefinitionDto)
  tasks: TaskDefinitionDto[];
}
