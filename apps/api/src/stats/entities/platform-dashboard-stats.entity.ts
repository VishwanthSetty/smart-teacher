import { ApiProperty } from '@nestjs/swagger';
import { SchoolStatus } from '@prisma/client';

export class RecentSchoolEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: SchoolStatus })
  status!: SchoolStatus;
}

export class ContentPipelineEntity {
  @ApiProperty()
  ready!: number;

  @ApiProperty()
  processing!: number;

  @ApiProperty()
  queued!: number;

  @ApiProperty()
  failed!: number;
}

export class PlatformDashboardStatsEntity {
  @ApiProperty()
  schools!: number;

  @ApiProperty()
  curricula!: number;

  @ApiProperty()
  videos!: number;

  @ApiProperty()
  documents!: number;

  @ApiProperty({ type: [RecentSchoolEntity] })
  recentSchools!: RecentSchoolEntity[];

  @ApiProperty({ type: ContentPipelineEntity })
  contentPipeline!: ContentPipelineEntity;
}
