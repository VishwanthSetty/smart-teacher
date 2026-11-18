import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  CALENDAR_IMPORT_TEMPLATE_NAME,
  MAX_CALENDAR_IMPORT_BYTES,
  XLSX_CONTENT_TYPE,
} from './calendar-entry-import';
import { ImportCalendarEntriesDto } from './dto/import-calendar-entries.dto';
import { CalendarImportResultEntity } from './entities/calendar-import-result.entity';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SchoolAcademicCalendarsService } from './school-academic-calendars.service';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { CreateSchoolAcademicCalendarDto } from './dto/create-school-academic-calendar.dto';
import { SchoolCalendarOverviewQueryDto } from './dto/school-calendar-overview-query.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';
import { AcademicCalendarDetailEntity, AcademicCalendarEntryEntity } from './entities/academic-calendar.entity';
import { SchoolCalendarOverviewEntity } from './entities/school-calendar-overview.entity';

// A school's own calendars — SCHOOL_ADMIN only. Tenant-scoped, so no
// @BypassTenantScope(): the tenant guard confines every read and write to the caller's
// school, and another school's calendar id is a 404.
@ApiTags('academic-calendar')
@ApiBearerAuth()
@Controller('school-academic-calendars')
@Roles(Role.SCHOOL_ADMIN)
export class SchoolAcademicCalendarsController {
  constructor(private readonly calendars: SchoolAcademicCalendarsService) {}

  @Get()
  @ApiResponse({ status: 200, type: SchoolCalendarOverviewEntity })
  @ApiResponse({ status: 404, description: 'Academic year not found.' })
  overview(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SchoolCalendarOverviewQueryDto,
  ): Promise<SchoolCalendarOverviewEntity> {
    return this.calendars.overview(actor, query.academicYearId);
  }

  @Post()
  @ApiResponse({ status: 201, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic year not found, or the pair is not entitled.' })
  @ApiResponse({
    status: 409,
    description: 'The school already has a calendar for that pair, or there is no published default to copy.',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSchoolAcademicCalendarDto,
  ): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.create(actor, dto);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.findOne(actor, id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 409, description: 'Already published, or has no entries.' })
  publish(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.publish(actor, id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 409, description: 'The calendar is not published.' })
  unpublish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.unpublish(actor, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Deleted; the pair falls back to the platform default.' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.calendars.remove(id);
  }

  @Post(':id/entries')
  @ApiResponse({ status: 201, type: AcademicCalendarEntryEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 422, description: 'The date is outside the academic year.' })
  addEntry(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCalendarEntryDto,
  ): Promise<AcademicCalendarEntryEntity> {
    return this.calendars.addEntry(actor, id, dto);
  }

  // A per-calendar template, so the example row already sits inside this calendar's year.
  @Get(':id/entries/import-template')
  @ApiResponse({ status: 200, description: 'An .xlsx template with Date, Lesson and Notes columns.' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  async importTemplate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const buffer = await this.calendars.importTemplate(actor, id);
    return new StreamableFile(buffer, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${CALENDAR_IMPORT_TEMPLATE_NAME}"`,
    });
  }

  // Upload twice: with dryRun=true to preview, then the same file without it to commit.
  // A commit with any invalid row writes nothing (422).
  @Post(':id/entries/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_CALENDAR_IMPORT_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        dryRun: { type: 'boolean' },
        replaceExisting: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 200, type: CalendarImportResultEntity })
  @ApiResponse({ status: 400, description: 'No file, unsupported type, or missing Date/Lesson headings.' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 413, description: 'File exceeds the 5 MB limit.' })
  @ApiResponse({ status: 422, description: 'Commit refused: some rows are invalid.' })
  importEntries(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ImportCalendarEntriesDto,
  ): Promise<CalendarImportResultEntity> {
    return this.calendars.importEntries(actor, id, file, dto);
  }

  @Patch(':id/entries/:entryId')
  @ApiResponse({ status: 200, type: AcademicCalendarEntryEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar or entry not found.' })
  @ApiResponse({ status: 422, description: 'The date is outside the academic year.' })
  updateEntry(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateCalendarEntryDto,
  ): Promise<AcademicCalendarEntryEntity> {
    return this.calendars.updateEntry(actor, id, entryId, dto);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Academic calendar or entry not found.' })
  removeEntry(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ): Promise<void> {
    return this.calendars.removeEntry(actor, id, entryId);
  }
}
