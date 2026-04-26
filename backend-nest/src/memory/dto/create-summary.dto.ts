import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateSummaryDto {
  @ApiProperty({ description: '会话ID' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: '摘要内容' })
  @IsString()
  content: string;
}
