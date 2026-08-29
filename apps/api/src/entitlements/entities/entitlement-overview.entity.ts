import { ApiProperty } from '@nestjs/swagger';
import { SchoolStatus } from '@prisma/client';

export class SchoolEntitlementOverviewEntity {
  @ApiProperty()
  schoolId!: string;

  @ApiProperty()
  schoolName!: string;

  @ApiProperty()
  schoolSlug!: string;

  @ApiProperty({ enum: SchoolStatus })
  schoolStatus!: SchoolStatus;

  @ApiProperty()
  studentCurricula!: number;

  @ApiProperty()
  teacherCurricula!: number;

  @ApiProperty()
  grantedCurricula!: number;

  @ApiProperty()
  totalCurricula!: number;
}

export class EntitlementOverviewEntity {
  @ApiProperty({ type: [SchoolEntitlementOverviewEntity] })
  schools!: SchoolEntitlementOverviewEntity[];
}
