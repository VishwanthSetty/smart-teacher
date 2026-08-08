import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { TeachersService } from './teachers.service';
import { TeacherImportService } from './teacher-import.service';
import { buildTemplateCsv } from './teacher-import-csv';
import { MAX_IMPORT_FILE_BYTES } from './teacher-import.constants';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherEntity } from './entities/teacher.entity';
import { SetUserPasswordDto } from '../passwords/dto/set-user-password.dto';
import { ConfirmImportDto } from '../passwords/dto/confirm-import.dto';
import { UserPasswordEntity } from '../passwords/entities/user-password.entity';
import {
  TeacherImportPreviewEntity,
  TeacherImportResultEntity,
} from './entities/teacher-import.entity';

@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teachers')
@Roles(Role.SCHOOL_ADMIN)
export class TeachersController {
  constructor(
    private readonly teachersService: TeachersService,
    private readonly teacherImportService: TeacherImportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Onboard a single teacher, optionally assigning subjects school-wide' })
  @ApiResponse({ status: 201, type: TeacherEntity })
  @ApiResponse({ status: 404, description: 'Subject not found.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  create(@Body() dto: CreateTeacherDto, @CurrentUser() actor: AuthenticatedUser): Promise<TeacherEntity> {
    return this.teachersService.create(dto, actor);
  }

  // Declared before GET :batchId — Express matches in declaration order, and otherwise
  // "template" would be read as a batch id.
  @Get('bulk/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="teacher-import-template.csv"')
  @ApiOperation({ summary: 'Download the teacher bulk-import CSV template' })
  @ApiResponse({ status: 200, description: 'CSV template with the expected headers' })
  getTemplate(): string {
    return buildTemplateCsv();
  }

  @Post('bulk')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Upload a teacher CSV and get a validation preview — writes no teachers',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 201, description: 'Preview of valid and invalid rows' })
  @ApiResponse({ status: 400, description: 'Unreadable file, missing headers, or row limit exceeded' })
  @ApiResponse({ status: 413, description: 'File exceeds the 5 MB limit' })
  createBatch(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeacherImportPreviewEntity> {
    if (!file) {
      throw new BadRequestException('Attach a CSV file in the "file" field.');
    }
    return this.teacherImportService.createBatch(file, user);
  }

  @Get('bulk/:batchId')
  @ApiOperation({ summary: 'Read back a previously uploaded import preview' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  getBatch(@Param('batchId') batchId: string): Promise<TeacherImportPreviewEntity> {
    return this.teacherImportService.getBatch(batchId);
  }

  @Post('bulk/:batchId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import the valid rows of a previewed batch; invalid rows are skipped' })
  @ApiResponse({ status: 200, description: 'Import result with created and skipped counts' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  @ApiResponse({ status: 409, description: 'Import already confirmed' })
  confirmBatch(
    @Param('batchId') batchId: string,
    @Body() dto: ConfirmImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeacherImportResultEntity> {
    return this.teacherImportService.confirmBatch(batchId, user, dto?.sendCredentialsEmail ?? false);
  }

  @Get('bulk/:batchId/errors')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="teacher-import-errors.csv"')
  @ApiOperation({ summary: 'Download the error report for the rows that failed validation' })
  @ApiResponse({ status: 404, description: 'Import not found' })
  getErrorReport(@Param('batchId') batchId: string): Promise<string> {
    return this.teacherImportService.buildErrorReport(batchId);
  }

  @Get(':id/password')
  @ApiOperation({ summary: 'Reveal the admin-readable teacher password' })
  @ApiResponse({ status: 200, type: UserPasswordEntity })
  getPassword(@Param('id') id: string): Promise<UserPasswordEntity> {
    return this.teachersService.getPassword(id);
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or generate a teacher password and revoke live sessions' })
  @ApiResponse({ status: 200, type: UserPasswordEntity })
  setPassword(@Param('id') id: string, @Body() dto: SetUserPasswordDto): Promise<{ password: string }> {
    return this.teachersService.setPassword(id, dto.password);
  }
}
