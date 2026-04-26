import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: ['http://localhost:8080'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 全局异常过滤器 - 统一错误格式
  app.useGlobalFilters(new AllExceptionsFilter());
  // 全局响应拦截器 - 统一成功响应格式
  app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor());

  const config = new DocumentBuilder()
    .setTitle('AI Chat API')
    .setDescription('NestJS Backend for AI Chat Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('chat', 'Chat endpoints')
    .addTag('admin', 'Admin endpoints')
    .addTag('a2a', 'Agent-to-Agent protocol')
    .addTag('hitl', 'Human-in-the-loop')
    .addTag('rag', 'RAG and knowledge endpoints')
    .addTag('search', 'Search endpoints')
    .addTag('memory', 'Memory management endpoints')
    .addTag('mission', 'Mission control endpoints')
    .addTag('metrics', 'Metrics endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 30001;
  await app.listen(port);
  console.log(`NestJS Backend running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api-docs`);
}

bootstrap();
