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

  @ApiProperty({ nullable: true })
  adminEmail!: string | null;

  @ApiProperty()
  createdAt!: Date;

  // adminEmail is on User (the school's SCHOOL_ADMIN), not School itself, so callers
  // resolve it separately and pass it in rather than this doing its own Prisma lookup.
  static fromModel(school: School, adminEmail: string | null): SchoolEntity {
    return {
      id: school.id,
      name: school.name,
      slug: school.slug,
      academicYear: school.academicYear,
      status: school.status,
      plan: school.plan,
      adminEmail,
      createdAt: school.createdAt,
    };
  }
}
