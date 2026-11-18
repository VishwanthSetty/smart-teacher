import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateDocumentProgressDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  lastPage!: number;

  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageCount?: number;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  clientUpdatedAt!: string;
}
