import { Module, Global } from '@nestjs/common';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useFactory: (): ConfigService => new ConfigService(),
    },
  ],
  controllers: [ConfigController],
  exports: [ConfigService],
})
export class ConfigModule {}
