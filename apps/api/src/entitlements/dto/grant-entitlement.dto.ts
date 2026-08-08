import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GrantEntitlementDto {
  // One curriculum is the whole (gradeLevel, subject) tree, and the licensing unit.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  curriculumId!: string;
}
