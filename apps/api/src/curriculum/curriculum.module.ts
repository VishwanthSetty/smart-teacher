import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ContentNodesService } from './content-nodes.service';
import { ContentNodesAdminController } from './content-nodes-admin.controller';
import { ContentTreeService } from './content-tree.service';
import { CurriculaAdminController } from './curricula-admin.controller';
import { CurriculaController } from './curricula.controller';
import { CurriculaService } from './curricula.service';
import { CurriculumAccessPolicy } from './curriculum-access.policy';
import { CurriculumSchemasAdminController } from './curriculum-schemas-admin.controller';
import { CurriculumSchemasService } from './curriculum-schemas.service';
import { ContentNodeUsabilityService } from './content-node-usability.service';

@Module({
  // For ActorContentScopeService, which answers "which curricula may this actor reach?"
  // — the same seam VideosModule reads, so a curriculum that vanishes from one surface
  // cannot still be reachable from the other.
  imports: [EntitlementsModule],
  controllers: [
    CurriculumSchemasAdminController,
    CurriculaAdminController,
    ContentNodesAdminController,
    CurriculaController,
  ],
  providers: [
    CurriculumSchemasService,
    CurriculaService,
    ContentNodesService,
    ContentTreeService,
    CurriculumAccessPolicy,
    ContentNodeUsabilityService,
  ],
  // Video and document ingest share the curriculum-owned destination-node rules through
  // this service; the authoring services themselves remain internal to the module.
  exports: [ContentNodeUsabilityService, CurriculaService],
})
export class CurriculumModule {}
