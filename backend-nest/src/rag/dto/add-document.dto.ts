import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class AddDocumentDto {
  @ApiProperty({ description: '文档标题', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ description: '文档内容' })
  @IsString()
  content: string;

  @ApiProperty({ description: '文档类型', required: false, default: 'text' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ description: '元数据', required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
