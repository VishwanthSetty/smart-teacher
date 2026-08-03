import { ApiProperty } from '@nestjs/swagger';

export class SectionEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  gradeLevelName!: string;

  @ApiProperty({ example: 'Grade 5 - A' })
  label!: string;

  @ApiProperty()
  studentCount!: number;
}
