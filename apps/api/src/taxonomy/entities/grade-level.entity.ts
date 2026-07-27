import { ApiProperty } from '@nestjs/swagger';

export class GradeLevelEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  rank!: number;
}
