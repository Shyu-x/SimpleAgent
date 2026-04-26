import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, IsEnum } from 'class-validator';
import { AgentStatus } from '../mission.service';

export class UpdateAgentDto {
  @ApiProperty({ description: '状态', required: false, enum: AgentStatus })
  @IsEnum(AgentStatus)
  @IsOptional()
  status?: AgentStatus;

  @ApiProperty({ description: '当前任务', required: false })
  @IsString()
  @IsOptional()
  currentTask?: string;

  @ApiProperty({ description: '进度', required: false })
  @IsNumber()
  @IsOptional()
  progress?: number;

  @ApiProperty({ description: '能力列表', required: false })
  @IsArray()
  @IsOptional()
  capabilities?: string[];
}
