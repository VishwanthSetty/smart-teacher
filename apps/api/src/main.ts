import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: the transcode callback's HMAC is computed over the bytes the worker sent.
  // Re-serialising the parsed body would reorder keys and drop whitespace, and the
  // signature would never match.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  // Per-IP login lockout reads req.ip; trust the BFF's X-Forwarded-For so that
  // reflects the real client rather than the Next.js server's address.
  app.set('trust proxy', true);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // Browser playback still uses the explicit page origin below; widening CORP only
  // permits media elements and Safari's native HLS loader to consume those responses.
  app.enableCors({
    origin: configService.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger stays off in production: it enumerates every route, DTO shape and auth
  // scheme, which is exactly the recon a public API shouldn't hand out for free. Dev and
  // test both keep it — test so e2e/local tooling can rely on it, dev so it's the daily
  // driver `/api/docs` promises in CLAUDE.md. Gated on APP_ENV, not NODE_ENV — the
  // Dockerfile always builds with NODE_ENV=production (Node's own build-mode flag), so
  // gating on that would also blind the local `docker compose up` dev stack.
  const appEnv = configService.get<'development' | 'test' | 'production'>('APP_ENV');
  if (appEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Smart Teacher API')
      .setDescription(`Smart Teacher backend API (${appEnv})`)
      .setVersion('0.0.1')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);
}

bootstrap();
