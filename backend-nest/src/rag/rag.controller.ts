import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RagService } from '../services/rag/rag.service';
import { CreateKbDto, AddDocumentDto, RetrieveDto, FetchUrlDto } from './dto';

@ApiTags('rag')
@ApiBearerAuth()
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('kb')
  @ApiOperation({ summary: '创建知识库' })
  async createKb(@Body() dto: CreateKbDto) {
    const kb = await this.ragService.createKnowledgeBase(dto.name, dto.description);
    return { success: true, knowledgeBase: kb };
  }

  @Get('kb')
  @ApiOperation({ summary: '列出所有知识库' })
  async listKb() {
    const knowledgeBases = this.ragService.listKnowledgeBases();
    return { success: true, knowledgeBases };
  }

  @Get('kb/:kbId')
  @ApiOperation({ summary: '获取知识库详情' })
  async getKb(@Param('kbId') kbId: string) {
    const kb = this.ragService.getKnowledgeBase(kbId);
    if (!kb) {
      return { success: false, error: { message: '知识库不存在', type: 'not_found' } };
    }
    return {
      success: true,
      knowledgeBase: {
        id: kb.id,
        name: kb.name,
        description: kb.description,
        documentCount: kb.documents.length,
        totalChunks: kb.documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
        documents: kb.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          chunks: doc.chunks.length,
          createdAt: doc.createdAt,
        })),
      },
    };
  }

  @Delete('kb/:kbId')
  @ApiOperation({ summary: '删除知识库' })
  async deleteKb(@Param('kbId') kbId: string) {
    await this.ragService.deleteKnowledgeBase(kbId);
    return { success: true, message: '知识库已删除' };
  }

  @Post('kb/:kbId/documents')
  @ApiOperation({ summary: '添加文档到知识库' })
  async addDocument(@Param('kbId') kbId: string, @Body() dto: AddDocumentDto) {
    const result = await this.ragService.addDocument(kbId, {
      title: dto.title || 'Untitled',
      content: dto.content,
      type: dto.type || 'text',
      metadata: dto.metadata,
    });
    return { success: true, documentId: result.docId, chunks: result.chunks };
  }

  @Post('kb/:kbId/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传文件到知识库' })
  async uploadDocument(@Param('kbId') kbId: string, @UploadedFile() file: any) {
    if (!file) {
      return { success: false, error: { message: '请选择要上传的文件', type: 'validation_error' } };
    }
    const parsed = await this.ragService.parseDocument(file.path);
    const result = await this.ragService.addDocument(kbId, {
      title: file.originalname.replace(/\.[^/.]+$/, ''),
      content: parsed.content,
      type: parsed.type,
      metadata: { originalFilename: file.originalname, ...parsed.metadata },
    });
    return { success: true, documentId: result.docId, chunks: result.chunks, title: file.originalname };
  }

  @Post('kb/:kbId/retrieve')
  @ApiOperation({ summary: '检索知识' })
  async retrieve(@Param('kbId') kbId: string, @Body() dto: RetrieveDto) {
    const results = await this.ragService.retrieve(kbId, dto.query, {
      topK: dto.topK || 5,
      similarityThreshold: dto.similarityThreshold || 0.3,
    });
    return { success: true, query: dto.query, results, count: results.length };
  }

  @Post('kb/:kbId/context')
  @ApiOperation({ summary: '获取对话上下文' })
  async getContext(@Param('kbId') kbId: string, @Body() dto: RetrieveDto) {
    const context = await this.ragService.getContextForConversation(kbId, dto.query, {
      topK: dto.topK || 5,
      similarityThreshold: dto.similarityThreshold || 0.3,
    });
    return {
      success: true,
      query: dto.query,
      hasContext: !!context,
      context: context?.context || null,
      sources: context?.sources || [],
      count: context?.count || 0,
    };
  }

  @Post('search')
  @ApiOperation({ summary: '全局搜索 - 搜索所有知识库' })
  async globalSearch(@Body() dto: RetrieveDto) {
    const topK = dto.topK || 5;
    const similarityThreshold = dto.similarityThreshold || 0.3;
    const allResults = await this.ragService.searchAll(dto.query, { topK, similarityThreshold });
    const knowledgeBases = this.ragService.listKnowledgeBases();

    return {
      success: true,
      query: dto.query,
      results: allResults,
      count: allResults.length,
      knowledgeBaseCount: knowledgeBases.length,
      searchedKBs: knowledgeBases.map((kb) => ({
        id: kb.id,
        name: kb.name,
        resultCount: allResults.filter((r: any) => r.kbId === kb.id).length,
      })),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '获取RAG统计信息' })
  async getStats() {
    const stats = this.ragService.getStats();
    return { success: true, stats };
  }

  @Post('fetch')
  @ApiOperation({ summary: '抓取网页内容' })
  async fetchUrl(@Body() dto: FetchUrlDto) {
    // Placeholder implementation - in production, use actual URL fetching
    return {
      success: true,
      content: `Fetched content from ${dto.url}`,
      metadata: { url: dto.url, title: dto.title || 'Webpage' },
      images: [],
      links: [],
      traceId: `trace_${Date.now()}`,
      duration: 0,
    };
  }

  @Post('kb/:kbId/fetch')
  @ApiOperation({ summary: '抓取网页并添加到知识库' })
  async fetchToKb(@Param('kbId') kbId: string, @Body() dto: FetchUrlDto) {
    const kb = this.ragService.getKnowledgeBase(kbId);
    if (!kb) {
      return { success: false, error: { message: '知识库不存在', type: 'not_found' } };
    }

    const result = await this.ragService.addDocument(kbId, {
      title: dto.title || dto.url,
      content: `Content from ${dto.url}`,
      type: 'article',
      metadata: { url: dto.url },
    });

    return {
      success: true,
      documentId: result.docId,
      chunks: result.chunks,
      title: dto.title || dto.url,
      metadata: {},
      traceId: `trace_${Date.now()}`,
    };
  }
}
