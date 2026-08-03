import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { StudentsService } from './students.service';
import { StudentImportService } from './student-import.service';
import { buildTemplateCsv } from './student-import-csv';
import { MAX_IMPORT_FILE_BYTES } from './student-import.constants';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentEntity } from './entities/student.entity';
import { PaginatedStudentsEntity } from './entities/paginated-students.entity';
import {
  StudentImportPreviewEntity,
  StudentImportResultEntity,
} from './entities/student-import.entity';

// No class-level @Roles: GET is wider (SCHOOL_ADMIN + TEACHER) than the writes
// (SCHOOL_ADMIN only), and getAllAndOverride means a method decorator replaces rather
// than widens the class list — a class-level default here would be misleading.
@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentImportService: StudentImportService,
  ) {}

  // Declared before GET/PATCH :id — Express matches in declaration order, and otherwise
  // "bulk" would be read as a student id.
  @Get('bulk/template')
  @Roles(Role.SCHOOL_ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="student-import-template.csv"')
  @ApiOperation({ summary: 'Download the student bulk-import CSV template' })
  @ApiResponse({ status: 200, description: 'CSV template with the expected headers' })
  getImportTemplate(): string {
    return buildTemplateCsv();
  }

  @Post('bulk')
  @Roles(Role.SCHOOL_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Upload a student CSV and get a validation preview — writes no students',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 201, description: 'Preview of valid and invalid rows' })
  @ApiResponse({ status: 400, description: 'Unreadable file, missing headers, or row limit exceeded' })
  @ApiResponse({ status: 413, description: 'File exceeds the 5 MB limit' })
  createImportBatch(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentImportPreviewEntity> {
    if (!file) {
      throw new BadRequestException('Attach a CSV file in the "file" field.');
    }
    return this.studentImportService.createBatch(file, user);
  }

  @Get('bulk/:batchId')
  @Roles(Role.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Read back a previously uploaded import preview' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  getImportBatch(@Param('batchId') batchId: string): Promise<StudentImportPreviewEntity> {
    return this.studentImportService.getBatch(batchId);
  }

  @Post('bulk/:batchId/confirm')
  @Roles(Role.SCHOOL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import the valid rows of a previewed batch; invalid rows are skipped' })
  @ApiResponse({ status: 200, description: 'Import result with created and skipped counts' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  @ApiResponse({ status: 409, description: 'Import already confirmed' })
  confirmImportBatch(
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentImportResultEntity> {
    return this.studentImportService.confirmBatch(batchId, user);
  }

  @Get('bulk/:batchId/errors')
  @Roles(Role.SCHOOL_ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="student-import-errors.csv"')
  @ApiOperation({ summary: 'Download the error report for the rows that failed validation' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  getImportErrorReport(@Param('batchId') batchId: string): Promise<string> {
    return this.studentImportService.buildErrorReport(batchId);
  }

  @Post()
  @Roles(Role.SCHOOL_ADMIN)
  @ApiResponse({ status: 201, type: StudentEntity })
  @ApiResponse({ status: 404, description: 'Section not found.' })
  @ApiResponse({ status: 409, description: 'Email or roll number already in use.' })
  create(@Body() dto: CreateStudentDto, @CurrentUser() actor: AuthenticatedUser): Promise<StudentEntity> {
    return this.studentsService.create(dto, actor);
  }

  @Get()
  @Roles(Role.SCHOOL_ADMIN, Role.TEACHER)
  @ApiResponse({ status: 200, type: PaginatedStudentsEntity })
  findAll(@Query() query: ListStudentsQueryDto): Promise<PaginatedStudentsEntity> {
    return this.studentsService.findAll(query);
  }

  @Patch(':id')
  @Roles(Role.SCHOOL_ADMIN)
  @ApiResponse({ status: 200, type: StudentEntity })
  @ApiResponse({ status: 404, description: 'Student or section not found.' })
  @ApiResponse({ status: 409, description: 'Roll number already in use in the target section.' })
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto): Promise<StudentEntity> {
    return this.studentsService.update(id, dto);
  }
}
