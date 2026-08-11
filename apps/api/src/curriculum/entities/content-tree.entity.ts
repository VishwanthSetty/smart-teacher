import { ApiProperty } from '@nestjs/swagger';
import { ContentAudience, CurriculumStatus, DocumentStatus, VideoStatus } from '@prisma/client';
import { ContentNodeEntity } from './content-node.entity';

/** A video as it appears inside a tree — enough to render a row and open the player. */
export class ContentTreeVideoEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  durationSecs!: number | null;

  @ApiProperty({ required: false, enum: VideoStatus })
  status?: VideoStatus;
}

export class ContentTreeDocumentEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ required: false, enum: DocumentStatus })
  status?: DocumentStatus;
}

export class ContentTreeNodeEntity extends ContentNodeEntity {
  @ApiProperty({ type: [ContentTreeNodeEntity] })
  children!: ContentTreeNodeEntity[];

  @ApiProperty({ type: [ContentTreeVideoEntity] })
  videos!: ContentTreeVideoEntity[];

  @ApiProperty({ type: [ContentTreeDocumentEntity] })
  documents!: ContentTreeDocumentEntity[];

  // Videos in this node AND everything beneath it, so a client can grey out or hide an
  // empty branch without walking the subtree itself.
  @ApiProperty()
  videoCountDeep!: number;

  @ApiProperty()
  documentCountDeep!: number;
}

export class ContentTreeEntity {
  @ApiProperty({ enum: ContentAudience })
  audience!: ContentAudience;
  @ApiProperty()
  curriculumId!: string;

  @ApiProperty()
  gradeLevelId!: string;

  @ApiProperty()
  gradeLevelName!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty({ enum: CurriculumStatus })
  status!: CurriculumStatus;

  @ApiProperty({ type: [ContentTreeNodeEntity] })
  nodes!: ContentTreeNodeEntity[];
}
