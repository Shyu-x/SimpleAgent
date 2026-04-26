import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ description: '事件类型', required: false })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ description: '消息内容' })
  @IsString()
  message: string;

  @ApiProperty({ description: '关联的任务ID', required: false })
  @IsString()
  @IsOptional()
  taskId?: string;

  @ApiProperty({ description: '关联的Agent ID', required: false })
  @IsString()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: '附加数据', required: false })
  @IsOptional()
  data?: any;
}
