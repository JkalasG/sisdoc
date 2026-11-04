import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { useRedisForSockets } from './shared/infrastructure/redis-io.adapter';
import { assertProductionConfig } from './shared/infrastructure/production-guard';

async function bootstrap() {
  // ConfigModule carga el .env al crear la app, así que el guardia lee también ese archivo antes de arrancar.
  require('dotenv').config();
  assertProductionConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await useRedisForSockets(app);

  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('SisDoc API').setVersion('0.1').build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
