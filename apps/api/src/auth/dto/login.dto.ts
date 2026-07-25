import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@smartteacher.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @MinLength(8)
  password!: string;

  // Email is unique per tenant, so a school slug disambiguates. Platform users
  // (SUPER_ADMIN) omit it and are resolved against the null-tenant scope.
  @ApiProperty({ example: 'springfield-high', required: false })
  @IsOptional()
  @IsString()
  schoolSlug?: string;
}
