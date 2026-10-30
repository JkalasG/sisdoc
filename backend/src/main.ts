import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

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
