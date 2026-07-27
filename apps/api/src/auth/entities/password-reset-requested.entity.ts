import { ApiProperty } from '@nestjs/swagger';

export class PasswordResetRequested {
  @ApiProperty({ example: "If that email exists, we've sent a link." })
  message!: string;
}
