import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class FetchUrlDto {
  @ApiProperty({ description: 'URL地址' })
  @IsString()
  url: string;

  @ApiProperty({ description: '自定义标题', required: false })
  @IsString()
  @IsOptional()
  title?: string;
}
