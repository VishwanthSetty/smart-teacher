import { ApiProperty } from '@nestjs/swagger';

export class LatestTimetableEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  href!: string;
}

export class DashboardStatsEntity {
  @ApiProperty()
  students!: number;

  @ApiProperty()
  teachers!: number;

  @ApiProperty()
  pendingInvites!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'null until the Class model exists (F-08); never 0 as a placeholder.',
  })
  classes!: number | null;

  @ApiProperty({
    nullable: true,
    type: LatestTimetableEntity,
    description: 'null until the Timetable model exists (F-09).',
  })
  latestTimetable!: LatestTimetableEntity | null;
}
