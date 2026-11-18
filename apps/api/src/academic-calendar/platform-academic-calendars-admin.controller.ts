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
import { PlatformAcademicCalendarsService } from './platform-academic-calendars.service';
import { CreateAcademicCalendarDto } from './dto/create-academic-calendar.dto';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { ListAcademicCalendarsQueryDto } from './dto/list-academic-calendars-query.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';
import {
  AcademicCalendarDetailEntity,
  AcademicCalendarEntryEntity,
  AcademicCalendarSummaryEntity,
} from './entities/academic-calendar.entity';

// Default calendar authoring — SUPER_ADMIN only, like the curriculum it plans against.
//
// No @BypassTenantScope(), unlike CurriculaAdminController: nothing here counts or reads
// a tenant-scoped model, so there is no cross-tenant query to excuse.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/academic-calendars')
@Roles(Role.SUPER_ADMIN)
export class PlatformAcademicCalendarsAdminController {
  constructor(private readonly calendars: PlatformAcademicCalendarsService) {}

  @Get()
  @ApiResponse({ status: 200, type: [AcademicCalendarSummaryEntity] })
  findAll(@Query() query: ListAcademicCalendarsQueryDto): Promise<AcademicCalendarSummaryEntity[]> {
    return this.calendars.findAll(query);
  }

  @Post()
  @ApiResponse({ status: 201, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic year, grade level or subject not found.' })
  @ApiResponse({ status: 409, description: 'A default already exists for that pair and year, or the subject is retired.' })
  create(@Body() dto: CreateAcademicCalendarDto): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.create(dto);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  findOne(@Param('id') id: string): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.findOne(id);
  }

  // POST, but 200 not 201: a state transition on an existing row, as with curricula.
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 409, description: 'Already published, or has no entries.' })
  publish(@Param('id') id: string): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.publish(id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: AcademicCalendarDetailEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 409, description: 'The calendar is not published.' })
  unpublish(@Param('id') id: string): Promise<AcademicCalendarDetailEntity> {
    return this.calendars.unpublish(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The calendar and its entries are deleted.' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.calendars.remove(id);
  }

  @Post(':id/entries')
  @ApiResponse({ status: 201, type: AcademicCalendarEntryEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  @ApiResponse({ status: 422, description: 'The date is outside the academic year.' })
  addEntry(@Param('id') id: string, @Body() dto: CreateCalendarEntryDto): Promise<AcademicCalendarEntryEntity> {
    return this.calendars.addEntry(id, dto);
  }

  // A per-calendar template, so the example row already sits inside this calendar's year.
  @Get(':id/entries/import-template')
  @ApiResponse({ status: 200, description: 'An .xlsx template with Date, Lesson and Notes columns.' })
  @ApiResponse({ status: 404, description: 'Academic calendar not found.' })
  async importTemplate(
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const buffer = await this.calendars.importTemplate(id);
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
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ImportCalendarEntriesDto,
  ): Promise<CalendarImportResultEntity> {
    return this.calendars.importEntries(id, file, dto);
  }

  @Patch(':id/entries/:entryId')
  @ApiResponse({ status: 200, type: AcademicCalendarEntryEntity })
  @ApiResponse({ status: 404, description: 'Academic calendar or entry not found.' })
  @ApiResponse({ status: 422, description: 'The date is outside the academic year.' })
  updateEntry(
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateCalendarEntryDto,
  ): Promise<AcademicCalendarEntryEntity> {
    return this.calendars.updateEntry(id, entryId, dto);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Academic calendar or entry not found.' })
  removeEntry(@Param('id') id: string, @Param('entryId') entryId: string): Promise<void> {
    return this.calendars.removeEntry(id, entryId);
  }
}
