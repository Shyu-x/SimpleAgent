import { Module } from '@nestjs/common';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { ToolModule } from './tool/tool.module';
import { ModelModule } from './model/model.module';
import { PromptModule } from './prompt/prompt.module';
import { TraceModule } from './trace/trace.module';

@Module({
  imports: [KnowledgeModule, ToolModule, ModelModule, PromptModule, TraceModule],
  controllers: [],
  providers: [],
})
export class AdminModule {}
