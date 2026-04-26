import { Module } from '@nestjs/common';
import { ModelRouterService } from './model/model-router.service';
import { HealthCheckerService } from './model/health-checker.service';
import { IntentClassifierService } from './rag/intent-classifier.service';
import { QueryRewriteService } from './rag/query-rewrite.service';
import { QueryDecomposeService } from './rag/query-decompose.service';
import { RerankerService } from './rag/reranker.service';
import { CitationAssemblerService } from './rag/citation-assembler.service';
import { IntentRouterService } from './agent/intent-router.service';
import { ToolExecutorService } from './agent/tool-executor.service';
import { MCPToolExecutorService } from './agent/mcp-tool-executor.service';
import { ToolResultMergerService } from './agent/tool-result-merger.service';
import { ContextAssemblerService } from './agent/context-assembler.service';
import { VectorSearchChannelService, KeywordSearchChannelService } from './search/search-channel.service';
import { SearchCoordinatorService } from './search/search-coordinator.service';

@Module({
  providers: [
    // Model domain
    ModelRouterService,
    HealthCheckerService,
    // RAG domain
    IntentClassifierService,
    QueryRewriteService,
    QueryDecomposeService,
    RerankerService,
    CitationAssemblerService,
    // Agent domain
    IntentRouterService,
    ToolExecutorService,
    MCPToolExecutorService,
    {
      provide: ToolResultMergerService,
      useFactory: () => new ToolResultMergerService(),
    },
    ContextAssemblerService,
    // Search domain
    {
      provide: VectorSearchChannelService,
      useFactory: () => new VectorSearchChannelService(),
    },
    {
      provide: KeywordSearchChannelService,
      useFactory: () => new KeywordSearchChannelService(),
    },
    {
      provide: SearchCoordinatorService,
      useFactory: () => new SearchCoordinatorService(),
    },
  ],
  exports: [
    // Model domain
    ModelRouterService,
    HealthCheckerService,
    // RAG domain
    IntentClassifierService,
    QueryRewriteService,
    QueryDecomposeService,
    RerankerService,
    CitationAssemblerService,
    // Agent domain
    IntentRouterService,
    ToolExecutorService,
    MCPToolExecutorService,
    ToolResultMergerService,
    ContextAssemblerService,
    // Search domain
    VectorSearchChannelService,
    KeywordSearchChannelService,
    SearchCoordinatorService,
  ],
})
export class DomainModule {}
