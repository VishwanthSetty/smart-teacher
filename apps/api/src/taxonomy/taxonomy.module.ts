import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { GradeLevelsController } from './grade-levels.controller';
import { SubjectsController } from './subjects.controller';
import { SubjectsAdminController } from './subjects-admin.controller';

@Module({
  controllers: [GradeLevelsController, SubjectsAdminController, SubjectsController],
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
