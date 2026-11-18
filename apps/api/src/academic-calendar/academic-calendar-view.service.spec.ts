import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AcademicCalendarStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { parseDateOnly } from './academic-calendar-dates.util';
import { AcademicCalendarScopeService } from './academic-calendar-scope.service';
import { AcademicCalendarViewService } from './academic-calendar-view.service';
import { AcademicYearsService } from './academic-years.service';
import { AcademicCalendarSource } from './entities/academic-calendar-view.entity';

const STUDENT: AuthenticatedUser = {
  sub: 'student-1',
  email: 'student@example.com',
  name: 'Student',
  role: Role.STUDENT,
  schoolId: 'school-a',
};

const YEAR = {
  id: 'year-1',
  label: '2026-2027',
  startDate: parseDateOnly('2026-06-01'),
  endDate: parseDateOnly('2027-03-31'),
};

const G5 = { id: 'g5', name: 'Grade 5', rank: 5 };
const MATHS = { id: 'maths', name: 'Mathematics', code: 'maths' };
const SCIENCE = { id: 'science', name: 'Science', code: 'science' };

function entry(id: string, date: string, title = id) {
  return { id, date: parseDateOnly(date), title, description: null };
}

describe('AcademicCalendarViewService', () => {
  let service: AcademicCalendarViewService;
  let prisma: {
    schoolAcademicCalendarSetting: { findFirst: jest.Mock };
    schoolAcademicCalendar: { findMany: jest.Mock };
    platformAcademicCalendar: { findMany: jest.Mock };
  };
  let years: { getOrThrow: jest.Mock; findContaining: jest.Mock };
  let scope: { browsePairs: jest.Mock };

  beforeEach(() => {
    prisma = {
      schoolAcademicCalendarSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      schoolAcademicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
      platformAcademicCalendar: { findMany: jest.fn().mockResolvedValue([]) },
    };
    years = { getOrThrow: jest.fn().mockResolvedValue(YEAR), findContaining: jest.fn().mockResolvedValue(YEAR) };
    scope = {
      browsePairs: jest.fn().mockResolvedValue([
        { gradeLevel: G5, subject: MATHS },
        { gradeLevel: G5, subject: SCIENCE },
      ]),
    };
    service = new AcademicCalendarViewService(
      prisma as unknown as PrismaService,
      years as unknown as AcademicYearsService,
      scope as unknown as AcademicCalendarScopeService,
    );
  });

  it('shows an empty calendar, without reading any plan, when the school opted out for the year', async () => {
    prisma.schoolAcademicCalendarSetting.findFirst.mockResolvedValue({ isEnabled: false });

    const result = await service.view(STUDENT, { academicYearId: YEAR.id });

    expect(result).toMatchObject({ isEnabled: false, entries: [] });
    expect(scope.browsePairs).not.toHaveBeenCalled();
    expect(prisma.schoolAcademicCalendar.findMany).not.toHaveBeenCalled();
    expect(prisma.platformAcademicCalendar.findMany).not.toHaveBeenCalled();
  });

  it("uses the school's published calendar for its pair and the default for the rest", async () => {
    prisma.schoolAcademicCalendar.findMany.mockResolvedValue([
      { gradeLevelId: G5.id, subjectId: MATHS.id, entries: [entry('own-1', '2026-07-01')] },
    ]);
    prisma.platformAcademicCalendar.findMany.mockResolvedValue([
      { gradeLevelId: G5.id, subjectId: SCIENCE.id, entries: [entry('default-1', '2026-06-15')] },
    ]);

    const result = await service.view(STUDENT, { academicYearId: YEAR.id });

    // Only the science pair is left for the default once maths is overridden.
    expect(prisma.platformAcademicCalendar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academicYearId: YEAR.id,
          status: AcademicCalendarStatus.PUBLISHED,
          OR: [{ gradeLevelId: G5.id, subjectId: SCIENCE.id }],
        },
      }),
    );
    expect(result.entries.map((e) => [e.id, e.source])).toEqual([
      ['default-1', AcademicCalendarSource.PLATFORM],
      ['own-1', AcademicCalendarSource.SCHOOL],
    ]);
    expect(result.entries[1]).toMatchObject({ date: '2026-07-01', subject: MATHS, gradeLevel: G5 });
  });

  it('only lets a PUBLISHED school calendar override the default', async () => {
    await service.view(STUDENT, { academicYearId: YEAR.id });

    expect(prisma.schoolAcademicCalendar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: AcademicCalendarStatus.PUBLISHED }),
      }),
    );
  });

  it('skips the default lookup when every pair is overridden', async () => {
    scope.browsePairs.mockResolvedValue([{ gradeLevel: G5, subject: MATHS }]);
    prisma.schoolAcademicCalendar.findMany.mockResolvedValue([
      { gradeLevelId: G5.id, subjectId: MATHS.id, entries: [] },
    ]);

    await service.view(STUDENT, { academicYearId: YEAR.id });

    expect(prisma.platformAcademicCalendar.findMany).not.toHaveBeenCalled();
  });

  it('shows nothing for a pair outside the browse scope, even when asked for it', async () => {
    const result = await service.view(STUDENT, { academicYearId: YEAR.id, gradeLevelId: 'g6' });

    expect(result).toMatchObject({ isEnabled: true, entries: [] });
    expect(prisma.schoolAcademicCalendar.findMany).not.toHaveBeenCalled();
  });

  it('narrows to the requested subject', async () => {
    await service.view(STUDENT, { academicYearId: YEAR.id, subjectId: SCIENCE.id });

    expect(prisma.schoolAcademicCalendar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ gradeLevelId: G5.id, subjectId: SCIENCE.id }] }),
      }),
    );
  });

  it('clamps the window to the academic year', async () => {
    const result = await service.view(STUDENT, { academicYearId: YEAR.id, from: '2026-05-01', to: '2026-06-30' });

    expect(result.from).toBe('2026-06-01');
    expect(result.to).toBe('2026-06-30');
  });

  it('rejects a window that ends before it starts', async () => {
    await expect(
      service.view(STUDENT, { academicYearId: YEAR.id, from: '2026-08-01', to: '2026-07-01' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a window longer than the maximum', async () => {
    await expect(
      service.view(STUDENT, { academicYearId: YEAR.id, from: '2026-01-01', to: '2027-12-31' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('picks the academic year containing `from` when no year is given', async () => {
    await service.view(STUDENT, { from: '2026-11-02', to: '2026-11-02' });

    expect(years.findContaining).toHaveBeenCalledWith(parseDateOnly('2026-11-02'));
    expect(years.getOrThrow).not.toHaveBeenCalled();
  });

  it('404s when no academic year covers the requested date', async () => {
    years.findContaining.mockResolvedValue(null);

    await expect(service.view(STUDENT, { from: '2030-01-01' })).rejects.toThrow(NotFoundException);
  });
});
