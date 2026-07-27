import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsIn, IsString, MinLength } from 'class-validator';

// SUPER_ADMIN is a platform role, never assignable by a tenant admin.
export const ASSIGNABLE_ROLES = [Role.TEACHER, Role.STUDENT, Role.SCHOOL_ADMIN] as const;

export class CreateUserDto {
  @ApiProperty({ example: 'teacher@smartteacher.dev' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane Teacher' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsEnum(Role)
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}
