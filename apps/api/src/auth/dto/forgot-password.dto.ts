import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'teacher@smartteacher.dev' })
  @IsEmail()
  email!: string;

  // Email is unique per tenant, so a school slug disambiguates. Platform users
  // (SUPER_ADMIN) omit it and are resolved against the null-tenant scope.
  @ApiProperty({ example: 'springfield-high', required: false })
  @IsOptional()
  @IsString()
  schoolSlug?: string;
}
