import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateTaskDto {
  @ApiProperty({ description: '任务名称', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: '任务描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '优先级', required: false })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiProperty({ description: '状态', required: false })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ description: '分配的Agent ID', required: false })
  @IsString()
  @IsOptional()
  assignedAgent?: string;

  @ApiProperty({ description: '结果', required: false })
  @IsOptional()
  result?: any;

  @ApiProperty({ description: '错误', required: false })
  @IsOptional()
  error?: string;
}
