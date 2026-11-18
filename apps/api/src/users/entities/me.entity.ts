import { ApiProperty } from '@nestjs/swagger';
import { Role, SchoolStatus } from '@prisma/client';

export class MeSchoolEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: SchoolStatus })
  status!: SchoolStatus;
}

export class MeEnrollmentEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sectionId!: string;

  @ApiProperty()
  sectionName!: string;

  @ApiProperty()
  sectionLabel!: string;

  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  gradeLevelName!: string;

  @ApiProperty()
  gradeLevelRank!: number;

  @ApiProperty({ nullable: true })
  rollNumber!: string | null;

  @ApiProperty({ description: 'The class the student is currently switched into.' })
  isCurrent!: boolean;
}

export class MeEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ nullable: true, type: String })
  schoolId!: string | null;

  @ApiProperty({ nullable: true, type: MeSchoolEntity })
  school!: MeSchoolEntity | null;

  @ApiProperty({
    nullable: true,
    type: MeEnrollmentEntity,
    description: 'The STUDENT\'s current class; null for other roles or an unplaced student.',
  })
  enrollment!: MeEnrollmentEntity | null;

  @ApiProperty({
    type: [MeEnrollmentEntity],
    description: 'Every ACTIVE class, current first. Drives the class switcher; empty for non-students.',
  })
  enrollments!: MeEnrollmentEntity[];
}
