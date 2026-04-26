import { Module } from '@nestjs/common';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { DomainModule } from '../domain/domain.module';

@Module({
  imports: [DomainModule],
  providers: [ChatOrchestratorService, AgentOrchestratorService],
  exports: [ChatOrchestratorService, AgentOrchestratorService],
})
export class ApplicationModule {}
