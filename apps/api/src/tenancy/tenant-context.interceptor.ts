import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { BYPASS_TENANT_SCOPE_KEY } from './decorators/bypass-tenant-scope.decorator';
import { TenantContextService } from './tenant-context.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    // No authenticated user (public routes, or a guard hasn't populated req.user yet,
    // e.g. the login flow) — leave the store unpopulated so any tenant-scoped query
    // fails closed unless it explicitly opts into a system bypass.
    if (user) {
      const allowBypass = this.reflector.getAllAndOverride<boolean>(BYPASS_TENANT_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      const bypass = !!allowBypass && user.role === Role.SUPER_ADMIN;
      this.tenantContext.populate(bypass ? null : (user.schoolId ?? null), bypass);
    }

    return next.handle();
  }
}
