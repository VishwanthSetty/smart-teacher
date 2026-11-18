import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsInt, Min } from 'class-validator';

export class UpdateVideoProgressDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  positionSecs!: number;

  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'number' } } })
  @IsArray()
  @IsArray({ each: true })
  intervals!: number[][];

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  clientUpdatedAt!: string;
}
