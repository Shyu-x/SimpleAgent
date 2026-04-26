import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MemoryService, Note, GlobalMemory } from './memory.service';
import {
  CreateNoteDto,
  UpdateNoteDto,
  CreateGlobalMemoryDto,
  UpdateGlobalMemoryDto,
  CreateSummaryDto,
} from './dto';

@ApiTags('memory')
@ApiBearerAuth()
@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  // Session memory endpoints
  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '获取指定会话的所有记忆' })
  getSessionNotes(@Param('sessionId') sessionId: string) {
    const notes = this.memoryService.getSessionNotes(sessionId);
    return { success: true, data: notes, total: notes.length };
  }

  @Post('sessions/:sessionId')
  @ApiOperation({ summary: '保存会话记忆' })
  createSessionNote(@Param('sessionId') sessionId: string, @Body() dto: CreateNoteDto) {
    if (!dto.content || typeof dto.content !== 'string') {
      return { success: false, error: { message: '记忆内容不能为空' } };
    }
    const note = this.memoryService.createSessionNote(sessionId, dto);
    return { success: true, data: note };
  }

  @Put('sessions/:sessionId')
  @ApiOperation({ summary: '更新会话记忆' })
  updateSessionNote(@Param('sessionId') sessionId: string, @Body() dto: UpdateNoteDto) {
    if (!dto.noteId) {
      return { success: false, error: { message: '缺少 noteId 参数' } };
    }
    const updated = this.memoryService.updateSessionNote(sessionId, dto.noteId, dto as Partial<Note>);
    return { success: true, data: updated };
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: '清除会话记忆' })
  deleteSessionNote(@Param('sessionId') sessionId: string, @Query('noteId') noteId?: string) {
    try {
      this.memoryService.deleteSessionNote(sessionId, noteId);
      return {
        success: true,
        message: noteId ? '记忆已删除' : '会话记忆已全部清除',
        deletedId: noteId,
      };
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  }

  // Global memory endpoints
  @Get('global')
  @ApiOperation({ summary: '获取所有全局记忆' })
  getGlobalMemories(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = this.memoryService.getGlobalMemories({
      type,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    return {
      success: true,
      data: result.data,
      total: result.total,
      offset: parseInt(offset || '0'),
      limit: parseInt(limit || String(result.total)),
    };
  }

  @Post('global')
  @ApiOperation({ summary: '创建全局记忆' })
  createGlobalMemory(@Body() dto: CreateGlobalMemoryDto) {
    if (!dto.content || typeof dto.content !== 'string') {
      return { success: false, error: { message: '记忆内容不能为空' } };
    }
    const memory = this.memoryService.createGlobalMemory(dto);
    return { success: true, data: memory };
  }

  @Put('global/:memoryId')
  @ApiOperation({ summary: '更新全局记忆' })
  updateGlobalMemory(@Param('memoryId') memoryId: string, @Body() dto: UpdateGlobalMemoryDto) {
    try {
      const updated = this.memoryService.updateGlobalMemory(memoryId, dto as Partial<GlobalMemory>);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  }

  @Delete('global/:memoryId')
  @ApiOperation({ summary: '删除全局记忆' })
  deleteGlobalMemory(@Param('memoryId') memoryId: string) {
    try {
      this.memoryService.deleteGlobalMemory(memoryId);
      return { success: true, message: '全局记忆已删除', deletedId: memoryId };
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  }

  @Post('global/:memoryId/access')
  @ApiOperation({ summary: '更新全局记忆访问时间' })
  accessGlobalMemory(@Param('memoryId') memoryId: string) {
    try {
      const memory = this.memoryService.accessGlobalMemory(memoryId);
      return { success: true, data: memory };
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  }

  @Get('search')
  @ApiOperation({ summary: '搜索全局记忆' })
  searchMemories(@Query('q') q: string, @Query('limit') limit?: string) {
    if (!q || typeof q !== 'string') {
      return { success: false, error: { message: '缺少搜索关键词' } };
    }
    const memories = this.memoryService.searchGlobalMemories(q, limit ? parseInt(limit) : 10);
    return { success: true, data: memories, total: memories.length, query: q };
  }

  // Summary endpoints
  @Get('summaries')
  @ApiOperation({ summary: '获取记忆摘要列表' })
  getSummaries(@Query('sessionId') sessionId?: string, @Query('limit') limit?: string) {
    const summaries = this.memoryService.getSummaries(sessionId, limit ? parseInt(limit) : 50);
    return { success: true, data: summaries, total: summaries.length };
  }

  @Post('summaries')
  @ApiOperation({ summary: '创建记忆摘要' })
  createSummary(@Body() dto: CreateSummaryDto) {
    if (!dto.sessionId || !dto.content) {
      return { success: false, error: { message: '缺少 sessionId 或 content' } };
    }
    const summary = this.memoryService.createSummary(dto.sessionId, dto.content);
    return { success: true, data: summary };
  }

  @Delete('summaries/:id')
  @ApiOperation({ summary: '删除记忆摘要' })
  deleteSummary(@Param('id') id: string) {
    try {
      this.memoryService.deleteSummary(id);
      return { success: true, message: '记忆摘要已删除', deletedId: id };
    } catch (error) {
      return { success: false, error: { message: error.message } };
    }
  }

  // Stats endpoint
  @Get('stats')
  @ApiOperation({ summary: '获取记忆系统统计信息' })
  getStats() {
    const stats = this.memoryService.getStats();
    return { success: true, data: stats };
  }
}
