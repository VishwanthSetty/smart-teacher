import { ApiProperty } from '@nestjs/swagger';
import { SubjectStatus } from '@prisma/client';

export class SubjectEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'maths' })
  code!: string;

  @ApiProperty({ enum: SubjectStatus })
  status!: SubjectStatus;
}
