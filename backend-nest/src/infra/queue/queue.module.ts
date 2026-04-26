import { Module, Global } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';

@Global()
@Module({
  providers: [
    {
      provide: QueueService,
      useFactory: (): QueueService => new QueueService(),
    },
  ],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
