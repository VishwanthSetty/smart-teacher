import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GrantEntitlementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  gradeLevelId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subjectId!: string;
}
