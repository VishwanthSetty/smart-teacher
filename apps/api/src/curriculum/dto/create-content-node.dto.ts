import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateContentNodeDto {
  // null creates a top-level node (depth 1). Explicitly nullable rather than optional so
  // "add at the root" is a stated intent, not an omission.
  @ApiProperty({ nullable: true, type: String })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(1)
  parentId!: string | null;

  // Unique within the curriculum. Stable across renames, which is what lets a re-run of
  // a bulk import update rows instead of duplicating them.
  @ApiProperty({ example: 'ch-01' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]*$/, {
    message: 'code must be lowercase alphanumeric with hyphens or dots',
  })
  @MaxLength(60)
  code!: string;

  @ApiProperty({ example: 'Fractions' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
