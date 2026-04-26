import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class SearchDto {
  @ApiProperty({ description: '搜索关键词' })
  @IsString()
  query: string;

  @ApiProperty({ description: '返回结果数量', required: false, default: 10 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  limit?: number;

  @ApiProperty({ description: '搜索源', required: false, default: 'jina' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({ description: '返回格式', required: false, default: 'json' })
  @IsString()
  @IsOptional()
  format?: string;
}
