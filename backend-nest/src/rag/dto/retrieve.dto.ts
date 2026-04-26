import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class RetrieveDto {
  @ApiProperty({ description: '查询内容' })
  @IsString()
  query: string;

  @ApiProperty({ description: '返回结果数量', required: false, default: 5 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  topK?: number;

  @ApiProperty({ description: '相似度阈值', required: false, default: 0.3 })
  @IsNumber()
  @IsOptional()
  similarityThreshold?: number;
}
