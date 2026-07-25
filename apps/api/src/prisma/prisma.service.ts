import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-guard.extension';
import type { TenantContextService } from '../tenancy/tenant-context.service';

export function createTenantScopedPrismaClient(tenantContext: TenantContextService) {
  return new PrismaClient().$extends(tenantGuardExtension(tenantContext));
}

type TenantScopedPrismaClient = ReturnType<typeof createTenantScopedPrismaClient>;

// `PrismaService` stays the DI token every feature module already injects; the
// interface merge below gives it the full extended-client surface (including
// $connect/$disconnect/$transaction) with no change at existing call sites.
export class PrismaService {}
export interface PrismaService extends TenantScopedPrismaClient {}

@Injectable()
export class PrismaLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
