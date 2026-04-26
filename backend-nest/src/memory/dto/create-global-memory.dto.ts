import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateGlobalMemoryDto {
  @ApiProperty({ description: '记忆内容' })
  @IsString()
  content: string;

  @ApiProperty({ description: '记忆类型', required: false, default: 'general' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ description: '重要性', required: false, default: 'medium' })
  @IsString()
  @IsOptional()
  importance?: string;

  @ApiProperty({ description: '标签', required: false })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty({ description: '用户ID', required: false, default: 'default' })
  @IsString()
  @IsOptional()
  userId?: string;
}
