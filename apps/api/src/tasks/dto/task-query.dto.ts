import { ApiProperty } from '@nestjs/swagger';
import { ProgressStatus, TaskStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListTasksQueryDto {
  @ApiProperty({ required: false, enum: TaskStatus })
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sectionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subjectId?: string;
}

export class TaskProgressQueryDto {
  @ApiProperty({ required: false, enum: ProgressStatus })
  @IsOptional() @IsEnum(ProgressStatus) status?: ProgressStatus;
}

export class ClassProgressQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() sectionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() subjectId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() taskId?: string;
}

export class StudentTasksQueryDto {
  @ApiProperty({ required: false, enum: ProgressStatus })
  @IsOptional() @IsEnum(ProgressStatus) status?: ProgressStatus;
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
}
