import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ToolService } from './tool.service';
import { ListToolsDto, RegisterToolDto, UpdateToolDto, PatchToolDto, TestToolDto, RecommendToolDto } from './dto';

@ApiTags('admin-tools')
@Controller('admin/tools')
export class ToolController {
  constructor(private readonly toolService: ToolService) {}

  @Get('categories')
  @ApiOperation({ summary: '获取工具分类列表' })
  getCategories() {
    return {
      success: true,
      data: this.toolService.listCategories(),
    };
  }

  @Get('categories/list')
  @ApiOperation({ summary: '按分类获取工具列表' })
  getCategoriesList() {
    return {
      success: true,
      data: this.toolService.listByCategory(),
    };
  }

  @Get()
  @ApiOperation({ summary: '获取工具列表' })
  getTools(@Query() query: ListToolsDto) {
    return {
      success: true,
      data: this.toolService.listTools(query),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: '获取工具统计' })
  getStats() {
    return {
      success: true,
      data: {
        summary: this.toolService.getStats(),
        tools: this.toolService.getAllStats(),
      },
    };
  }

  @Get(':name')
  @ApiOperation({ summary: '获取工具详情' })
  getTool(@Param('name') name: string) {
    return {
      success: true,
      data: this.toolService.getTool(name),
    };
  }

  @Post('register')
  @ApiOperation({ summary: '注册工具' })
  @HttpCode(HttpStatus.OK)
  registerTool(@Body() dto: RegisterToolDto) {
    return {
      success: true,
      data: this.toolService.register(dto),
    };
  }

  @Patch(':name')
  @ApiOperation({ summary: '更新工具启用状态' })
  patchTool(@Param('name') name: string, @Body() dto: PatchToolDto) {
    return {
      success: true,
      data: this.toolService.patch(name, dto),
    };
  }

  @Put(':name')
  @ApiOperation({ summary: '更新工具配置' })
  updateTool(@Param('name') name: string, @Body() dto: UpdateToolDto) {
    return {
      success: true,
      data: this.toolService.update(name, dto),
    };
  }

  @Delete(':name')
  @ApiOperation({ summary: '删除工具' })
  deleteTool(@Param('name') name: string) {
    return {
      success: true,
      data: this.toolService.delete(name),
    };
  }

  @Post(':name/test')
  @ApiOperation({ summary: '测试工具' })
  @HttpCode(HttpStatus.OK)
  testTool(@Param('name') name: string, @Body() dto: TestToolDto) {
    return {
      success: true,
      data: this.toolService.test(name, dto),
    };
  }

  @Post('recommend')
  @ApiOperation({ summary: '工具推荐测试' })
  @HttpCode(HttpStatus.OK)
  recommendTools(@Body() dto: RecommendToolDto) {
    return {
      success: true,
      data: this.toolService.recommendTools(dto),
    };
  }
}
