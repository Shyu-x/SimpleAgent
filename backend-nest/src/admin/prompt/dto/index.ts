import { IsOptional, IsString, IsArray, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListPromptsDto {
  @ApiPropertyOptional({ description: '分类过滤' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '仅内置模板' })
  @IsOptional()
  @IsString()
  builtin?: string;
}

export class CreatePromptDto {
  @ApiPropertyOptional({ description: '模板名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '模板描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '模板内容' })
  @IsString()
  template: string;
}

export class UpdatePromptDto {
  @ApiPropertyOptional({ description: '模板名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '模板描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '模板内容' })
  @IsOptional()
  @IsString()
  template?: string;
}

export class TestPromptDto {
  @ApiPropertyOptional({ description: '变量' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

export class TestRenderDto {
  @ApiPropertyOptional({ description: '模板内容' })
  @IsString()
  template: string;

  @ApiPropertyOptional({ description: '变量' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

export class RollbackPromptDto {
  @ApiPropertyOptional({ description: '版本号' })
  @IsOptional()
  @IsString()
  version?: string;
}
