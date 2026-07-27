import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateVideoDto {
  @ApiProperty({ example: 'Grade 5 Maths — Fractions' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ required: false, example: 'An introduction to numerators and denominators.' })
  @IsOptional()
  @IsString()
  description?: string;

  // Provider-agnostic handle; the video adapter (F-19) resolves it to a playback URL.
  // Never a signed URL — that would outlive the entitlement check that produced it.
  @ApiProperty({ example: 'demo-g5-maths-01' })
  @IsString()
  @MinLength(1)
  externalId!: string;

  @ApiProperty({ required: false, example: 480 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  durationSecs?: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  gradeLevelId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subjectId!: string;
}
