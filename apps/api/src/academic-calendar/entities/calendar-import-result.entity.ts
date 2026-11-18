import { ApiProperty } from '@nestjs/swagger';

export class CalendarImportRowEntity {
  @ApiProperty({ description: '1-based spreadsheet row; the header is row 1.' })
  rowNumber!: number;

  @ApiProperty({ example: '2026-07-14' })
  date!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;
}

export class CalendarImportRowErrorEntity {
  @ApiProperty()
  rowNumber!: number;

  @ApiProperty({ description: 'As written in the file when it could not be read as a date.' })
  date!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: [String] })
  errors!: string[];
}

export class CalendarImportResultEntity {
  @ApiProperty({ description: 'false for a dry run, which writes nothing.' })
  isCommitted!: boolean;

  @ApiProperty()
  replaceExisting!: boolean;

  @ApiProperty({ description: 'Non-blank rows read from the file.' })
  totalRows!: number;

  @ApiProperty({ type: [CalendarImportRowEntity], description: 'The rows that will be (or were) added.' })
  rows!: CalendarImportRowEntity[];

  @ApiProperty({ type: [CalendarImportRowErrorEntity] })
  errors!: CalendarImportRowErrorEntity[];

  @ApiProperty({ description: 'Rows already in the calendar (same date and lesson), skipped when appending.' })
  duplicateCount!: number;

  @ApiProperty({ description: 'Existing entries removed (replace mode only).' })
  deletedCount!: number;

  @ApiProperty()
  createdCount!: number;
}
