import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { StorageModule } from '../storage/storage.module';
import { DocumentsAccessPolicy } from './documents-access.policy';
import { DocumentsAdminController } from './documents-admin.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [CurriculumModule, EntitlementsModule, StorageModule],
  controllers: [DocumentsController, DocumentsAdminController],
  providers: [DocumentsService, DocumentsAccessPolicy],
  exports: [DocumentsService],
})
export class DocumentsModule {}
