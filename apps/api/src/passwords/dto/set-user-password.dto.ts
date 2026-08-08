import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetUserPasswordDto {
  @ApiProperty({ required: false, description: 'Left blank, a password is generated.' })
  @Transform(({ value }: { value: unknown }) => value === '' ? undefined : value)
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}
