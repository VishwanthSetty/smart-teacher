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
}

// Never the Prisma row: passwordHash, token hashes and internal ids stay server-side.
export class StudentEntity {
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

  @ApiProperty({ type: StudentEnrollmentEntity, nullable: true })
  enrollment!: StudentEnrollmentEntity | null;
}
