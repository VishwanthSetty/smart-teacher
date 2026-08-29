import { ApiProperty } from '@nestjs/swagger';

export class InvitePreviewEntity {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  schoolName!: string;
}
