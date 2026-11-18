import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @ApiProperty({ required: false, nullable: true, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}
