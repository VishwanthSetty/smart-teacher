import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { TenancyModule } from './tenancy/tenancy.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SchoolsModule } from './schools/schools.module';
import { StatsModule } from './stats/stats.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { TeachersModule } from './teachers/teachers.module';
import { StudentsModule } from './students/students.module';
import { VideosModule } from './videos/videos.module';
import { HealthModule } from './health/health.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { WorkerAuthGuard } from './auth/guards/worker-auth.guard';
import { PlaybackModule } from './playback/playback.module';
import { PlaybackTokenGuard } from './playback/playback-token.guard';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    // Jest sets NODE_ENV=test on this same process before AppModule is compiled (e2e specs
    // boot Nest in-process via createE2eApp), so .env.test — a separate DATABASE_URL — is
    // picked up here rather than the dev .env. Without this, e2e runs write straight into
    // the docker-compose dev database and never clean up after themselves.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    TenancyModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SchoolsModule,
    StatsModule,
    EntitlementsModule,
    TaxonomyModule,
    CurriculumModule,
    TeachersModule,
    StudentsModule,
    VideosModule,
    DocumentsModule,
    PlaybackModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Order matters: authenticate (populating request.user) before authorizing
    // against it. Deny-by-default (F-06): every route must declare @Public,
    // @AnyRole, or @Roles(...) — RolesGuard denies anything undeclared.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Third category, after the two above have stood down for it: a @WorkerRoute() has no
    // bearer token and no Role, and is authenticated by an HMAC over the raw body. Global
    // so that the one piece of metadata which excuses a route from RolesGuard is the same
    // piece that subjects it to this guard.
    { provide: APP_GUARD, useClass: WorkerAuthGuard },
    { provide: APP_GUARD, useClass: PlaybackTokenGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
