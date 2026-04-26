import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { ListDocsDto, SearchDocsDto, UploadDocDto, DeleteDocDto, ReindexDto } from './dto';

@ApiTags('admin-knowledge')
@Controller('admin/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('docs')
  @ApiOperation({ summary: '获取文档列表' })
  async getDocuments(@Query() query: ListDocsDto) {
    return {
      success: true,
      data: await this.knowledgeService.listDocs(query),
    };
  }

  @Get('search')
  @ApiOperation({ summary: '搜索文档' })
  async searchDocuments(@Query() query: SearchDocsDto) {
    return {
      success: true,
      data: await this.knowledgeService.search(query),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '获取知识库统计信息' })
  async getStats() {
    const stats = await this.knowledgeService.getStats();
    const knowledgeBases = this.knowledgeService.listKnowledgeBases();

    return {
      success: true,
      data: {
        ...stats,
        knowledgeBases: knowledgeBases.map(kb => ({
          id: kb.id,
          name: kb.name,
          description: kb.description,
          documentCount: kb.documentCount,
          totalChunks: kb.totalChunks,
          createdAt: kb.createdAt,
          updatedAt: kb.updatedAt,
        })),
      },
    };
  }

  @Post('docs')
  @ApiOperation({ summary: '上传文档' })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadDocument(
    @Body() dto: UploadDocDto,
    @UploadedFile() file?: any,
  ) {
    return {
      success: true,
      data: await this.knowledgeService.upload(dto, file),
    };
  }

  @Delete('docs/:id')
  @ApiOperation({ summary: '删除文档' })
  async deleteDocument(@Param('id') id: string, @Query('kbId') kbId: string) {
    return {
      success: true,
      data: await this.knowledgeService.delete({ id, kbId }),
    };
  }

  @Post('reindex')
  @ApiOperation({ summary: '重建索引' })
  @HttpCode(HttpStatus.OK)
  async reindex(@Body() dto: ReindexDto) {
    return {
      success: true,
      data: await this.knowledgeService.reindex(dto),
    };
  }
}
