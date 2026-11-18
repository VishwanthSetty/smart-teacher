import { ApiProperty } from '@nestjs/swagger';
import { BulkContentKind } from '../content-bulk.constants';

export class BulkContentCreateItemEntity {
  @ApiProperty({ description: 'Position of this item in the request.' })
  index!: number;

  @ApiProperty({ enum: BulkContentKind })
  kind!: BulkContentKind;

  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ required: false })
  id?: string;

  @ApiProperty({ required: false, description: 'Presigned PUT for this item. Short-lived.' })
  uploadUrl?: string;

  @ApiProperty({ required: false })
  expiresInSecs?: number;

  @ApiProperty({ required: false, description: 'Why this item was refused. Absent when ok.' })
  error?: string;
}

export class BulkContentCreateResultEntity {
  @ApiProperty()
  createdCount!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiProperty({ type: [BulkContentCreateItemEntity] })
  items!: BulkContentCreateItemEntity[];
}

export class BulkContentConfirmItemEntity {
  @ApiProperty({ description: 'Position of this item in the request.' })
  index!: number;

  @ApiProperty({ enum: BulkContentKind })
  kind!: BulkContentKind;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  ok!: boolean;

  @ApiProperty({
    required: false,
    description: 'The status after confirming: QUEUED for a video, READY for a document.',
  })
  status?: string;

  @ApiProperty({ required: false, description: 'Why this item failed. Absent when ok.' })
  error?: string;
}

export class BulkContentConfirmResultEntity {
  @ApiProperty()
  confirmedCount!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiProperty({ type: [BulkContentConfirmItemEntity] })
  items!: BulkContentConfirmItemEntity[];
}
