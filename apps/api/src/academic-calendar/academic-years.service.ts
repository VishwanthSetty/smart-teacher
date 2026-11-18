import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOnly } from './academic-calendar-dates.util';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { AcademicYearEntity, type AcademicYearRow } from './entities/academic-year.entity';

// Scalars only: AcademicYear carries tenant-scoped back-relations, so including one from
// this root would enter the tenant guard's nested walker.
export const ACADEMIC_YEAR_SELECT = {
  id: true,
  label: true,
  startDate: true,
  endDate: true,
} as const satisfies Prisma.AcademicYearSelect;

// The platform-wide academic years every calendar hangs off. Authored by SUPER_ADMIN;
// every role reads the list to pick a year.
@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AcademicYearEntity[]> {
    const years = await this.prisma.academicYear.findMany({
      select: ACADEMIC_YEAR_SELECT,
      orderBy: { startDate: 'desc' },
    });
    return years.map((year) => AcademicYearEntity.fromModel(year));
  }

  async getOrThrow(id: string): Promise<AcademicYearRow> {
    const year = await this.prisma.academicYear.findUnique({ where: { id }, select: ACADEMIC_YEAR_SELECT });
    if (year === null) {
      throw new NotFoundException('Academic year not found');
    }
    return year;
  }

  // Overlapping years are allowed (a school may run a bridge term), so the latest start
  // wins: it is the year a date most recently rolled into.
  async findContaining(date: Date): Promise<AcademicYearRow | null> {
    return this.prisma.academicYear.findFirst({
      where: { startDate: { lte: date }, endDate: { gte: date } },
      select: ACADEMIC_YEAR_SELECT,
      orderBy: { startDate: 'desc' },
    });
  }

  async create(dto: CreateAcademicYearDto): Promise<AcademicYearEntity> {
    const startDate = parseDateOnly(dto.startDate);
    const endDate = parseDateOnly(dto.endDate);
    requireOrderedRange(startDate, endDate);

    try {
      const year = await this.prisma.academicYear.create({
        data: { label: dto.label, startDate, endDate },
        select: ACADEMIC_YEAR_SELECT,
      });
      return AcademicYearEntity.fromModel(year);
    } catch (error) {
      throw labelConflictOr(error);
    }
  }

  // Requires @BypassTenantScope() on the caller: narrowing the range counts school
  // entries across every tenant, which SUPER_ADMIN (no schoolId) cannot do otherwise.
  async update(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYearEntity> {
    const existing = await this.getOrThrow(id);
    const startDate = dto.startDate === undefined ? existing.startDate : parseDateOnly(dto.startDate);
    const endDate = dto.endDate === undefined ? existing.endDate : parseDateOnly(dto.endDate);
    requireOrderedRange(startDate, endDate);

    // Narrowing must not strand entries outside the year: they would vanish from every
    // range-bounded read with no way to see why.
    const outside = { OR: [{ date: { lt: startDate } }, { date: { gt: endDate } }] };
    const [platformOutside, schoolOutside] = await this.prisma.$transaction([
      this.prisma.platformAcademicCalendarEntry.count({
        where: { calendar: { academicYearId: id }, ...outside },
      }),
      this.prisma.schoolAcademicCalendarEntry.count({
        where: { calendar: { academicYearId: id }, ...outside },
      }),
    ]);
    if (platformOutside > 0 || schoolOutside > 0) {
      throw new ConflictException(
        `${platformOutside + schoolOutside} calendar entries fall outside the new dates; move or delete them first`,
      );
    }

    try {
      const year = await this.prisma.academicYear.update({
        where: { id },
        data: { label: dto.label, startDate, endDate },
        select: ACADEMIC_YEAR_SELECT,
      });
      return AcademicYearEntity.fromModel(year);
    } catch (error) {
      throw labelConflictOr(error);
    }
  }

  // Requires @BypassTenantScope() on the caller, same as update. Each count is rooted at
  // the referencing model rather than reached through an AcademicYear relation, so it
  // answers the platform-wide question instead of "in this one tenant".
  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);

    const [platformCalendars, schoolCalendars, settings] = await this.prisma.$transaction([
      this.prisma.platformAcademicCalendar.count({ where: { academicYearId: id } }),
      this.prisma.schoolAcademicCalendar.count({ where: { academicYearId: id } }),
      this.prisma.schoolAcademicCalendarSetting.count({ where: { academicYearId: id } }),
    ]);
    if (platformCalendars > 0 || schoolCalendars > 0 || settings > 0) {
      throw new ConflictException('This academic year is still used by calendars or school settings');
    }

    await this.prisma.academicYear.delete({ where: { id } });
  }
}

function requireOrderedRange(startDate: Date, endDate: Date): void {
  if (startDate.getTime() >= endDate.getTime()) {
    throw new UnprocessableEntityException('startDate must be before endDate');
  }
}

function labelConflictOr(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException('An academic year with this label already exists');
  }
  return error;
}
