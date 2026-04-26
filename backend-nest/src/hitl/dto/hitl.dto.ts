import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsObject,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CheckpointStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

export enum CheckpointType {
  DECISION = 'decision',
  ACTION = 'action',
  DATA_ACCESS = 'data_access',
  HIGH_RISK = 'high_risk',
  COST_LIMIT = 'cost_limit',
}

export class CreateCheckpointDto {
  @ApiPropertyOptional({ enum: CheckpointType })
  @IsOptional()
  @IsEnum(CheckpointType)
  type?: CheckpointType;

  @ApiProperty({ description: 'Checkpoint title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Checkpoint description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Context data' })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Options list' })
  @IsOptional()
  @IsArray()
  options?: Array<{ label?: string; value?: string; description?: string }>;

  @ApiPropertyOptional({ description: 'Default option' })
  @IsOptional()
  @IsString()
  defaultOption?: string;

  @ApiPropertyOptional({ description: 'Timeout in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(3600000)
  timeout?: number;

  @ApiPropertyOptional({ description: 'Is confirmation required' })
  @IsOptional()
  isRequired?: boolean;
}

export class ApproveCheckpointDto {
  @ApiPropertyOptional({ description: 'Selected option' })
  @IsOptional()
  @IsString()
  option?: string;

  @ApiPropertyOptional({ description: 'Comment' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'User ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class RejectCheckpointDto {
  @ApiPropertyOptional({ description: 'Rejection reason' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'User ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class WaitCheckpointDto {
  @ApiPropertyOptional({ description: 'Wait timeout in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(3600000)
  timeout?: number;
}

export class ConfirmDto {
  @ApiPropertyOptional({ enum: CheckpointType })
  @IsOptional()
  @IsEnum(CheckpointType)
  type?: CheckpointType;

  @ApiProperty({ description: 'Confirmation title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Context data' })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Options list' })
  @IsOptional()
  @IsArray()
  options?: Array<{ label?: string; value?: string; description?: string }>;

  @ApiPropertyOptional({ description: 'Timeout in milliseconds' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(3600000)
  timeout?: number;

  @ApiPropertyOptional({ description: 'Is confirmation required' })
  @IsOptional()
  isRequired?: boolean;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ description: 'Max history items to return' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class CheckpointResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: CheckpointType;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  status: CheckpointStatus;

  @ApiProperty()
  createdAt: number;

  @ApiPropertyOptional()
  respondedAt?: number;

  @ApiPropertyOptional()
  response?: {
    option?: string;
    comment?: string;
    reason?: string;
  };
}

export class StatsResponseDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  approved: number;

  @ApiProperty()
  rejected: number;

  @ApiProperty()
  timeout: number;
}
