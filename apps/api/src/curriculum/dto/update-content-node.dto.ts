import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateContentNodeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]*$/, {
    message: 'code must be lowercase alphanumeric with hyphens or dots',
  })
  @MaxLength(60)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Structure is not editable here — parentId and sortOrder move together and go through
  // the move route, which is the only place the path rewrite is done correctly.
}
