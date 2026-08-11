import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience, CurriculumStatus } from '@prisma/client';

export class EntitlementEntity {
  @ApiProperty({ enum: ContentAudience })
  audience!: ContentAudience;
  @ApiProperty()
  id!: string;

  @ApiProperty()
  schoolId!: string;

  @ApiProperty()
  curriculumId!: string;

  // Denormalized off the curriculum for display. The grant is keyed on curriculumId
  // alone; these are what an operator reads in the admin grid.
  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  gradeLevelName!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  // A grant may legitimately precede publication, so an operator needs to see that a
  // granted curriculum is not yet reaching the school.
  @ApiProperty({ enum: CurriculumStatus })
  curriculumStatus!: CurriculumStatus;

  @ApiProperty()
  grantedAt!: Date;
}
