import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// A PATCH must never push a student back to PENDING — that status only exists between
// invite and first login, and is set exclusively by StudentsService.create.
export const STUDENT_PATCHABLE_STATUSES = [UserStatus.ACTIVE, UserStatus.DISABLED] as const;

export class UpdateStudentDto {
  @ApiProperty({ example: 'Asha', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @ApiProperty({ example: 'Rao', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiProperty({
    example: '12',
    required: false,
    description: 'Unique within the enrolled section. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;

  @ApiProperty({ required: false, description: 'Re-enrolls the student into a different section' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ enum: STUDENT_PATCHABLE_STATUSES, required: false })
  @IsOptional()
  @IsEnum(UserStatus)
  @IsIn(STUDENT_PATCHABLE_STATUSES)
  status?: UserStatus;
}
