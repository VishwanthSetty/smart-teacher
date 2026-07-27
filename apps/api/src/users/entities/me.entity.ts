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
}
