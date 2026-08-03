import { Module } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { GradeLevelsController } from './grade-levels.controller';
import { GradeLevelsReadController } from './grade-levels-read.controller';
import { SubjectsController } from './subjects.controller';
import { SubjectsAdminController } from './subjects-admin.controller';

@Module({
  controllers: [
    GradeLevelsController,
    GradeLevelsReadController,
    SubjectsAdminController,
    SubjectsController,
  ],
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
