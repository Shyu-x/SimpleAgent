import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListDocsDto {
  @ApiPropertyOptional({ description: '知识库ID' })
  @IsOptional()
  @IsString()
  kbId?: string;

  @ApiPropertyOptional({ default: 1, description: '页码' })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: '每页数量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class SearchDocsDto {
  @ApiProperty({ description: '搜索关键词' })
  @IsString()
  q: string;

  @ApiPropertyOptional({ description: '知识库ID' })
  @IsOptional()
  @IsString()
  kbId?: string;

  @ApiPropertyOptional({ default: 10, description: '返回结果数量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  topK?: number = 10;
}

export class UploadDocDto {
  @ApiPropertyOptional({ description: '知识库ID' })
  @IsOptional()
  @IsString()
  kbId?: string;

  @ApiPropertyOptional({ description: '知识库名称（不存在时创建）' })
  @IsOptional()
  @IsString()
  kbName?: string;

  @ApiPropertyOptional({ description: '文档标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '文档内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '文档类型' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class DeleteDocDto {
  @ApiProperty({ description: '文档ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: '知识库ID' })
  @IsString()
  kbId: string;
}

export class ReindexDto {
  @ApiPropertyOptional({ description: '知识库ID（可选，不传则全量重建）' })
  @IsOptional()
  @IsString()
  kbId?: string;
}
