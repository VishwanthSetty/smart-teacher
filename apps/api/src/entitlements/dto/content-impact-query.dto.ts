import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ContentImpactQueryDto {
  @ApiProperty()
  @IsString()
  curriculumId!: string;
}
