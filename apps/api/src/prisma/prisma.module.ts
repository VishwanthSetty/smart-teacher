import { Global, Module } from '@nestjs/common';
import { createTenantScopedPrismaClient, PrismaLifecycle, PrismaService } from './prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: (tenantContext: TenantContextService): PrismaService =>
        createTenantScopedPrismaClient(tenantContext) as PrismaService,
      inject: [TenantContextService],
    },
    PrismaLifecycle,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
