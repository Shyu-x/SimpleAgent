import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PromptService } from './prompt.service';
import { ListPromptsDto, CreatePromptDto, UpdatePromptDto, TestPromptDto, TestRenderDto, RollbackPromptDto } from './dto';

@ApiTags('admin-prompts')
@Controller('admin/prompts')
export class PromptController {
  constructor(private readonly promptService: PromptService) {}

  @Get()
  @ApiOperation({ summary: '获取模板列表' })
  getTemplates(@Query() query: ListPromptsDto) {
    return {
      success: true,
      data: this.promptService.listTemplates(query),
    };
  }

  @Get('categories')
  @ApiOperation({ summary: '获取所有分类' })
  getCategories() {
    return {
      success: true,
      data: this.promptService.listCategories(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取模板详情' })
  getTemplate(@Param('id') id: string) {
    return {
      success: true,
      data: this.promptService.getTemplate(id),
    };
  }

  @Post()
  @ApiOperation({ summary: '创建模板' })
  @HttpCode(HttpStatus.CREATED)
  createTemplate(@Body() dto: CreatePromptDto) {
    return {
      success: true,
      data: this.promptService.createTemplate(dto),
    };
  }

  @Put(':id')
  @ApiOperation({ summary: '更新模板' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdatePromptDto) {
    return {
      success: true,
      data: this.promptService.updateTemplate(id, dto),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模板' })
  deleteTemplate(@Param('id') id: string) {
    return {
      success: true,
      data: this.promptService.deleteTemplate(id),
    };
  }

  @Post(':id/test')
  @ApiOperation({ summary: '测试模板' })
  @HttpCode(HttpStatus.OK)
  testTemplate(@Param('id') id: string, @Body() dto: TestPromptDto) {
    return {
      success: true,
      data: this.promptService.testTemplate(id, dto),
    };
  }

  @Post('test-render')
  @ApiOperation({ summary: '直接测试模板渲染' })
  @HttpCode(HttpStatus.OK)
  testRender(@Body() dto: TestRenderDto) {
    return {
      success: true,
      data: this.promptService.testRender(dto),
    };
  }

  @Get(':id/versions')
  @ApiOperation({ summary: '获取模板版本历史' })
  getVersions(@Param('id') id: string) {
    return {
      success: true,
      data: this.promptService.getVersions(id),
    };
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: '回滚模板到指定版本' })
  @HttpCode(HttpStatus.OK)
  rollback(@Param('id') id: string, @Body() dto: RollbackPromptDto) {
    return {
      success: true,
      data: this.promptService.rollback(id, dto),
    };
  }
}
