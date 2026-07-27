import { Module } from '@nestjs/common';
import { ContentEntitlementsService } from './content-entitlements.service';
import { ActorContentScopeService } from './actor-content-scope.service';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';
import { EntitlementsAdminController } from './entitlements-admin.controller';

@Module({
  controllers: [EntitlementsAdminController],
  providers: [ContentEntitlementsService, ActorContentScopeService, ContentEntitlementsAdminService],
  // The admin service is not exported: it takes an explicit schoolId and is only safe
  // behind the SUPER_ADMIN + @BypassTenantScope controller in this module.
  exports: [ContentEntitlementsService, ActorContentScopeService],
})
export class EntitlementsModule {}
