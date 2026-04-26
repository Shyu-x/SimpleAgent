/**
 * 服务模块
 * 集中管理所有服务层组件
 */

import { Module, OnModuleInit } from '@nestjs/common';
import { AgentEngineService } from './agent/agent-engine.service';
import { RagService } from './rag/rag.service';
import { ChatModelService, MiniMaxChatModelClient } from './model/chat-model.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { SSEService } from './sse/sse.service';
import { MemoryService } from './memory/memory.service';
import { QdrantRouterService } from './vector/qdrant-router.service';
import { getBuiltinTools } from './tools';

@Module({
  providers: [
    AgentEngineService,
    RagService,
    ChatModelService,
    MiniMaxChatModelClient,
    ToolRegistryService,
    SSEService,
    MemoryService,
    QdrantRouterService
  ],
  exports: [
    AgentEngineService,
    RagService,
    ChatModelService,
    MiniMaxChatModelClient,
    ToolRegistryService,
    SSEService,
    MemoryService,
    QdrantRouterService
  ]
})
export class ServicesModule implements OnModuleInit {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  onModuleInit() {
    // 注册所有内置工具
    const builtinTools = getBuiltinTools();
    for (const tool of builtinTools) {
      this.toolRegistry.register(tool);
    }
    console.log(`[ServicesModule] Registered ${builtinTools.length} built-in tools`);
  }
}
