import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SwitchCurrentEnrollmentDto {
  @ApiProperty({ description: 'One of the caller\'s own ACTIVE enrollment ids, from GET /users/me' })
  @IsString()
  @IsNotEmpty()
  enrollmentId!: string;
}
