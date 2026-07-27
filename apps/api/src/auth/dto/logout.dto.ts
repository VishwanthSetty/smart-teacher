import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  // When present, only this session's refresh-token family is revoked, leaving
  // other devices logged in. Omitted, every session for the user is revoked.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
