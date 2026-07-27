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
import { VideosModule } from './videos/videos.module';
import { HealthModule } from './health/health.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TenancyModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SchoolsModule,
    StatsModule,
    EntitlementsModule,
    TaxonomyModule,
    VideosModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Order matters: authenticate (populating request.user) before authorizing
    // against it. Deny-by-default (F-06): every route must declare @Public,
    // @AnyRole, or @Roles(...) — RolesGuard denies anything undeclared.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
