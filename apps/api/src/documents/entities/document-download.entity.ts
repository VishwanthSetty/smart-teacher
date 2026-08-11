import { ApiProperty } from '@nestjs/swagger';

export class DocumentDownloadEntity {
  @ApiProperty() url!: string;
  @ApiProperty() expiresInSecs!: number;
  @ApiProperty() fileName!: string;
}
