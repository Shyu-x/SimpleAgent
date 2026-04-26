import { Module, Global } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';

@Global()
@Module({
  providers: [
    {
      provide: AlertService,
      useFactory: (): AlertService => new AlertService(),
    },
  ],
  controllers: [AlertController],
  exports: [AlertService],
})
export class AlertModule {}
