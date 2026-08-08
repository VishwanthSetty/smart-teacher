import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * "Same as Maths, one level deeper" is the common way a new vocabulary starts, so cloning
 * is a first-class operation rather than an invitation to retype every level.
 */
export class CloneCurriculumSchemaDto {
  @ApiProperty({ example: 'Unit / Chapter / Topic' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'unit-chapter-topic' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'code must be lowercase alphanumeric with hyphens',
  })
  @MaxLength(60)
  code!: string;
}
