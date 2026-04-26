import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({ description: '记忆内容' })
  @IsString()
  content: string;

  @ApiProperty({ description: '记忆类型', required: false, default: 'short_term' })
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

  @ApiProperty({ description: '向量嵌入', required: false })
  @IsArray()
  @IsOptional()
  embedding?: number[];
}
