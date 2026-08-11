import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class TeacherSubjectEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ nullable: true })
  gradeLevelId!: string | null;

  @ApiProperty({ nullable: true })
  gradeLevelName!: string | null;
}

// Never the Prisma row: passwordHash, token hashes and internal ids stay server-side.
export class TeacherEntity {
  @ApiProperty({ required: false, description: 'Returned only when the teacher is created.' })
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

  @ApiProperty({ type: [TeacherSubjectEntity] })
  subjects!: TeacherSubjectEntity[];
}
