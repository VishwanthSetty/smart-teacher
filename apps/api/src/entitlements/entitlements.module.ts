import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { TeachersModule } from '../teachers/teachers.module';
import { ContentEntitlementsService } from './content-entitlements.service';
import { ActorContentScopeService } from './actor-content-scope.service';
import { ContentEntitlementsAdminService } from './content-entitlements-admin.service';
import { EntitlementsAdminController } from './entitlements-admin.controller';
import { EntitlementsOverviewAdminController } from './entitlements-overview-admin.controller';
import { ContentImpactController } from './content-impact.controller';
import { ContentImpactService } from './content-impact.service';

@Module({
  imports: [StudentsModule, TeachersModule],
  controllers: [EntitlementsAdminController, EntitlementsOverviewAdminController, ContentImpactController],
  providers: [
    ContentEntitlementsService,
    ActorContentScopeService,
    ContentEntitlementsAdminService,
    ContentImpactService,
  ],
  // The admin service is not exported: it takes an explicit schoolId and is only safe
  // behind the SUPER_ADMIN + @BypassTenantScope controller in this module.
  exports: [ContentEntitlementsService, ActorContentScopeService],
})
export class EntitlementsModule {}
