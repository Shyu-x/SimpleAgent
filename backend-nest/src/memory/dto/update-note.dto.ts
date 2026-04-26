import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateNoteDto {
  @ApiProperty({ description: '记忆ID' })
  @IsString()
  noteId: string;

  @ApiProperty({ description: '记忆内容', required: false })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ description: '记忆类型', required: false })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({ description: '重要性', required: false })
  @IsString()
  @IsOptional()
  importance?: string;

  @ApiProperty({ description: '标签', required: false })
  @IsArray()
  @IsOptional()
  tags?: string[];
}
