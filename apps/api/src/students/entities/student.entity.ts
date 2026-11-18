import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class StudentEnrollmentEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sectionId!: string;

  @ApiProperty()
  sectionName!: string;

  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  gradeLevelName!: string;

  @ApiProperty({ nullable: true })
  rollNumber!: string | null;

  @ApiProperty({ description: 'The class the student is currently switched into.' })
  isCurrent!: boolean;
}

// Never the Prisma row: passwordHash, token hashes and internal ids stay server-side.
export class StudentEntity {
  @ApiProperty({ required: false, description: 'Returned only when the student is created.' })
  password?: string;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  firstName!: string | null;

  @ApiProperty({ nullable: true })
  lastName!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ nullable: true })
  activatedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({
    type: StudentEnrollmentEntity,
    nullable: true,
    deprecated: true,
    description: 'The current class only. Use `enrollments` — a student may be in several classes.',
  })
  enrollment!: StudentEnrollmentEntity | null;

  @ApiProperty({
    type: [StudentEnrollmentEntity],
    description: 'Every ACTIVE class, current first.',
  })
  enrollments!: StudentEnrollmentEntity[];
}
