import { IsOptional, IsString, IsBoolean, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateModelDto {
  @ApiPropertyOptional({ description: '设为默认模型' })
  @IsOptional()
  @IsString()
  defaultModel?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '重置熔断器' })
  @IsOptional()
  @IsBoolean()
  resetCircuit?: boolean;
}

export class HealthCheckDto {
  @ApiPropertyOptional({ description: '超时时间(ms)' })
  @IsOptional()
  @IsInt()
  timeout?: number;
}
