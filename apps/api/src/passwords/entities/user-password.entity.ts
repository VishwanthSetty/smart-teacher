import { ApiProperty } from '@nestjs/swagger';

export class UserPasswordEntity {
  @ApiProperty({ nullable: true })
  password!: string | null;
}
