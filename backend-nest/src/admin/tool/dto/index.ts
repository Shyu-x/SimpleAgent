import { IsOptional, IsString, IsInt, IsBoolean, IsArray, IsObject, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListToolsDto {
  @ApiPropertyOptional({ description: '工具分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class RegisterToolDto {
  @ApiPropertyOptional({ description: '工具名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '工具描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '参数定义' })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @ApiPropertyOptional({ description: '工具分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '关键词' })
  @IsOptional()
  @IsArray()
  keywords?: string[];

  @ApiPropertyOptional({ description: '示例' })
  @IsOptional()
  @IsArray()
  examples?: string[];
}

export class UpdateToolDto {
  @ApiPropertyOptional({ description: '工具描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '参数定义' })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @ApiPropertyOptional({ description: '工具分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '关键词' })
  @IsOptional()
  @IsArray()
  keywords?: string[];

  @ApiPropertyOptional({ description: '示例' })
  @IsOptional()
  @IsArray()
  examples?: string[];
}

export class PatchToolDto {
  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TestToolDto {
  @ApiPropertyOptional({ description: '测试参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @ApiPropertyOptional({ description: '超时时间(ms)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  timeout?: number;
}

export class RecommendToolDto {
  @ApiPropertyOptional({ description: '查询内容' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: '意图' })
  @IsOptional()
  @IsString()
  intent?: string;
}
