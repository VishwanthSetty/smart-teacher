import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience } from '@prisma/client';

export class ContentImpactEntity {
  @ApiProperty({ enum: ContentAudience }) audience!: ContentAudience;
  @ApiProperty() curriculumId!: string;
  @ApiProperty() gradeLevelId!: string;
  @ApiProperty() subjectId!: string;
  @ApiProperty() schoolCount!: number;
  @ApiProperty() studentCount!: number;
  @ApiProperty() videoCount!: number;
  @ApiProperty() documentCount!: number;
  @ApiProperty() teacherCount!: number;
}
