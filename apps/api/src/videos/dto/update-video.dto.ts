import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateVideoDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Re-filing a video moves it anywhere in the tree, including into another curriculum —
  // which changes which schools can see it, so the service re-validates the destination.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contentNodeId?: string;

  @ApiProperty({ required: false, nullable: true })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsBoolean()
  retainSource?: boolean | null;
}
