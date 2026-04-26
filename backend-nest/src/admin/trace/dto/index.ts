import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListTracesDto {
  @ApiPropertyOptional({ default: 20, description: '返回数量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, description: '偏移量' })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ description: '状态过滤' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '服务名称过滤' })
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional({ description: '追踪ID过滤' })
  @IsOptional()
  @IsString()
  traceId?: string;
}

export class CreateTraceDto {
  @ApiPropertyOptional({ description: '操作名称' })
  @IsOptional()
  @IsString()
  operationName?: string;

  @ApiPropertyOptional({ description: '服务名称' })
  @IsOptional()
  @IsString()
  serviceName?: string;
}

export class ClearTracesDto {
  @ApiPropertyOptional({ description: '管理员密码' })
  @IsOptional()
  @IsString()
  password?: string;
}
