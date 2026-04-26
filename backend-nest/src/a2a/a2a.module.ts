import { Module } from '@nestjs/common';
import { A2AController } from './a2a.controller';
import { A2AService } from './a2a.service';
import { A2AGateway } from './a2a.gateway';

@Module({
  controllers: [A2AController],
  providers: [A2AService, A2AGateway],
  exports: [A2AService],
})
export class A2AModule {}
