import { ApiProperty } from '@nestjs/swagger';
import { Plan } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// Lowercase, URL-safe slug: alphanumeric segments separated by single hyphens.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateSchoolDto {
  @ApiProperty({ example: 'Springfield High' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'springfield-high' })
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase, alphanumeric, and hyphen-separated',
  })
  slug!: string;

  @ApiProperty({ example: '2025-2026' })
  @IsString()
  @MinLength(1)
  academicYear!: string;

  @ApiProperty({ enum: Plan, required: false, default: Plan.FREE })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @ApiProperty({ example: 'principal@springfield.edu' })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ example: 'Seymour Skinner' })
  @IsString()
  @MinLength(1)
  adminName!: string;
}
