import { IsString, IsOptional, IsArray, IsNumber, Min, Max, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageContentDto {
  @ApiProperty({ description: '消息角色', enum: ['system', 'user', 'assistant'] })
  @IsString()
  role: 'system' | 'user' | 'assistant';

  @ApiProperty({ description: '消息内容' })
  @IsString()
  content: string;
}

export class ChatMessageDto {
  @ApiPropertyOptional({ description: '消息数组' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageContentDto)
  messages?: ChatMessageContentDto[];

  @ApiPropertyOptional({ description: '简化的单条消息格式' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: '模型名称，默认 MiniMax-M2.7' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: '是否使用 SSE 流式响应，默认 true' })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({ description: '温度参数 0-2', default: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: '最大 token 数', default: 8192 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
  max_tokens?: number;

  @ApiPropertyOptional({ description: '是否启用思维链分离' })
  @IsOptional()
  @IsBoolean()
  reasoning_split?: boolean;

  @ApiPropertyOptional({ description: '思维预算 token 数' })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(100000)
  thinking_budget?: number;
}

export class StopGenerationDto {
  @ApiPropertyOptional({ description: '会话 ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '请求 ID' })
  @IsOptional()
  @IsString()
  requestId?: string;
}
