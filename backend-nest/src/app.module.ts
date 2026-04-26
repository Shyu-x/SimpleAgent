import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { A2AModule } from './a2a/a2a.module';
import { HitlModule } from './hitl/hitl.module';
import { RagModule } from './rag/rag.module';
import { SearchModule } from './search/search.module';
import { MemoryModule } from './memory/memory.module';
import { MissionModule } from './mission/mission.module';
import { InfraModule } from './infra/infra.module';
import { DomainModule } from './domain/domain.module';
import { CommonModule } from './common/common.module';
import { ApplicationModule } from './application/application.module';

@Module({
  imports: [
    CommonModule,
    ChatModule,
    AdminModule,
    A2AModule,
    HitlModule,
    RagModule,
    SearchModule,
    MemoryModule,
    MissionModule,
    InfraModule,
    DomainModule,
    ApplicationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
