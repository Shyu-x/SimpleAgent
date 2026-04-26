import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ description: '任务名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '任务描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '优先级', required: false, default: 'medium' })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({ description: '分配的Agent ID', required: false })
  @IsString()
  @IsOptional()
  assignedAgent?: string;
}
