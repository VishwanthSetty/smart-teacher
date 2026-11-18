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
    description: 'Applies to the current class. Unique within that section. Send an empty string to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;

  @ApiProperty({ required: false, description:
      'Moves the current class to a different section. Other classes are untouched — use /students/:id/enrollments to add or remove classes.' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ enum: STUDENT_PATCHABLE_STATUSES, required: false })
  @IsOptional()
  @IsEnum(UserStatus)
  @IsIn(STUDENT_PATCHABLE_STATUSES)
  status?: UserStatus;
}
