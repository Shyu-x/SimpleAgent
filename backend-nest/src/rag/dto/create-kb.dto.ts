import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateKbDto {
  @ApiProperty({ description: '知识库名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '知识库描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
