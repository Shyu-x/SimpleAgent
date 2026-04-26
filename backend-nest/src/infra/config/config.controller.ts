/**
 * Config Controller - 配置中心端点
 */
import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { ConfigService } from './config.service';

@Controller('api/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getAll() {
    return this.configService.getAll();
  }

  @Get(':type')
  getConfig(@Param('type') type: string, @Query('key') key?: string) {
    if (key) {
      return this.configService.get(`${type}.${key}`);
    }
    return this.configService.get(type);
  }

  @Put(':type')
  setConfig(@Param('type') type: string, @Body() body: { key?: string; value: any }) {
    if (body.key) {
      this.configService.set(`${type}.${body.key}`, body.value);
    } else {
      this.configService.set(type, body.value);
    }
    return { success: true };
  }

  @Post('reload/:type?')
  async reload(@Param('type') type?: string) {
    await this.configService.reload(type);
    return { success: true };
  }

  @Post('export/:type')
  async exportConfig(@Param('type') type: string, @Body() body: { filePath?: string }) {
    const filePath = await this.configService.exportToFile(type, body.filePath);
    return { filePath };
  }
}
