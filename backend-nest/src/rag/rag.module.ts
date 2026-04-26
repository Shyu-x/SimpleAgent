import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { RagController } from './rag.controller';
import { RagService } from '../services/rag/rag.service';
import { QueryRewriteService } from '../domain/rag/query-rewrite.service';
import { QueryDecomposeService } from '../domain/rag/query-decompose.service';
import { RerankerService } from '../domain/rag/reranker.service';

@Module({
  imports: [
    MulterModule.register({
      dest: './data/rag/uploads',
    }),
  ],
  controllers: [RagController],
  providers: [
    {
      provide: QueryRewriteService,
      useFactory: () => new QueryRewriteService(),
    },
    {
      provide: QueryDecomposeService,
      useFactory: () => new QueryDecomposeService(),
    },
    {
      provide: RerankerService,
      useFactory: () => new RerankerService(),
    },
    {
      provide: RagService,
      useFactory: (
        queryRewriteService: QueryRewriteService,
        queryDecomposeService: QueryDecomposeService,
        rerankerService: RerankerService,
      ) => new RagService(
        queryRewriteService,
        queryDecomposeService,
        rerankerService,
        {}
      ),
      inject: [QueryRewriteService, QueryDecomposeService, RerankerService],
    },
  ],
  exports: [RagService],
})
export class RagModule {}
