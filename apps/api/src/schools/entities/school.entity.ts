import { ApiProperty } from '@nestjs/swagger';
import { Plan, School, SchoolStatus } from '@prisma/client';

export class SchoolEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  academicYear!: string;

  @ApiProperty({ enum: SchoolStatus })
  status!: SchoolStatus;

  @ApiProperty({ enum: Plan })
  plan!: Plan;

  @ApiProperty()
  createdAt!: Date;

  static fromModel(school: School): SchoolEntity {
    return {
      id: school.id,
      name: school.name,
      slug: school.slug,
      academicYear: school.academicYear,
      status: school.status,
      plan: school.plan,
      createdAt: school.createdAt,
    };
  }
}
