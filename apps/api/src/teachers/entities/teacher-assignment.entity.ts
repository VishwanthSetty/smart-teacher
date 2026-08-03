import { ApiProperty } from '@nestjs/swagger';

// Never the Prisma row: sectionId/sectionName/gradeLevelId/gradeLevelName/sectionLabel
// are all null together for a school-wide "teaches this subject" grant — the shape the
// teacher CSV import produces, which predates sections.
export class TeacherAssignmentEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  teacherId!: string;

  @ApiProperty()
  teacherName!: string;

  @ApiProperty()
  teacherEmail!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty()
  subjectCode!: string;

  @ApiProperty({ nullable: true })
  sectionId!: string | null;

  @ApiProperty({ nullable: true })
  sectionName!: string | null;

  @ApiProperty({ nullable: true })
  gradeLevelId!: string | null;

  @ApiProperty({ nullable: true })
  gradeLevelName!: string | null;

  @ApiProperty({ nullable: true, example: 'Grade 5 - A' })
  sectionLabel!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
