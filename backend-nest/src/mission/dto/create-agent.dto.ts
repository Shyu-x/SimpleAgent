import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ description: 'Agent名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Agent角色', required: false, default: 'executor' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({ description: '头像', required: false })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiProperty({ description: '能力列表', required: false })
  @IsArray()
  @IsOptional()
  capabilities?: string[];
}
