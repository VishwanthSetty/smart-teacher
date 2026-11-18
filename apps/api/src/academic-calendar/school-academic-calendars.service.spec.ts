import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AcademicCalendarStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { parseDateOnly } from './academic-calendar-dates.util';
import { AcademicCalendarScopeService } from './academic-calendar-scope.service';
import { AcademicYearsService } from './academic-years.service';
import { SchoolAcademicCalendarAccessPolicy } from './school-academic-calendar-access.policy';
import { SchoolAcademicCalendarsService } from './school-academic-calendars.service';
import { AcademicCalendarSource } from './entities/academic-calendar-view.entity';

const ADMIN: AuthenticatedUser = {
  sub: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: Role.SCHOOL_ADMIN,
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
const ENGLISH = { id: 'english', name: 'English', code: 'english' };

const CREATE_DTO = { academicYearId: YEAR.id, gradeLevelId: G5.id, subjectId: MATHS.id };

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cal-1',
    status: AcademicCalendarStatus.DRAFT,
    publishedAt: null,
    academicYear: YEAR,
    gradeLevel: G5,
    subject: MATHS,
    gradeLevelId: G5.id,
    subjectId: MATHS.id,
    entries: [],
    ...overrides,
  };
}

describe('SchoolAcademicCalendarsService', () => {
  let service: SchoolAcademicCalendarsService;
  let tx: { schoolAcademicCalendar: { create: jest.Mock }; schoolAcademicCalendarEntry: { createMany: jest.Mock } };
  let prisma: {
    schoolAcademicCalendar: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
    schoolAcademicCalendarEntry: {
      create: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      groupBy: jest.Mock;
    };
    schoolAcademicCalendarSetting: { findFirst: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
    platformAcademicCalendar: { findFirst: jest.Mock; findMany: jest.Mock };
    platformAcademicCalendarEntry: { groupBy: jest.Mock };
    $transaction: jest.Mock;
  };
  let scope: { authorizedPairs: jest.Mock; isAuthorized: jest.Mock };
  let policy: { canRead: jest.Mock };

  beforeEach(() => {
    tx = {
      schoolAcademicCalendar: { create: jest.fn().mockResolvedValue({ id: 'cal-1' }) },
      schoolAcademicCalendarEntry: { createMany: jest.fn() },
    };
    prisma = {
      schoolAcademicCalendar: {
        findUnique: jest.fn().mockResolvedValue(detailRow()),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      schoolAcademicCalendarEntry: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      schoolAcademicCalendarSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      platformAcademicCalendar: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      platformAcademicCalendarEntry: { groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    scope = {
      authorizedPairs: jest.fn().mockResolvedValue([]),
      isAuthorized: jest.fn().mockResolvedValue(true),
    };
    policy = { canRead: jest.fn().mockResolvedValue(true) };
    const years = { getOrThrow: jest.fn().mockResolvedValue(YEAR), findAll: jest.fn() };

    service = new SchoolAcademicCalendarsService(
      prisma as unknown as PrismaService,
      years as unknown as AcademicYearsService,
      scope as unknown as AcademicCalendarScopeService,
      policy as unknown as SchoolAcademicCalendarAccessPolicy,
    );
  });

  describe('create', () => {
    it('404s for a grade and subject the school is not entitled to', async () => {
      scope.isAuthorized.mockResolvedValue(false);

      await expect(service.create(ADMIN, CREATE_DTO)).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("copies the published default's entries into the new calendar", async () => {
      const copied = { date: parseDateOnly('2026-07-01'), title: 'Fractions', description: null };
      prisma.platformAcademicCalendar.findFirst.mockResolvedValue({ entries: [copied] });

      await service.create(ADMIN, { ...CREATE_DTO, copyFromDefault: true });

      expect(prisma.platformAcademicCalendar.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: AcademicCalendarStatus.PUBLISHED }),
        }),
      );
      expect(tx.schoolAcademicCalendarEntry.createMany).toHaveBeenCalledWith({
        data: [{ schoolId: 'school-a', calendarId: 'cal-1', ...copied }],
      });
    });

    it('starts blank without looking for a default unless asked to copy', async () => {
      await service.create(ADMIN, CREATE_DTO);

      expect(prisma.platformAcademicCalendar.findFirst).not.toHaveBeenCalled();
      expect(tx.schoolAcademicCalendarEntry.createMany).not.toHaveBeenCalled();
    });

    it('refuses to copy when there is no published default', async () => {
      prisma.platformAcademicCalendar.findFirst.mockResolvedValue(null);

      await expect(service.create(ADMIN, { ...CREATE_DTO, copyFromDefault: true })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('turns a duplicate calendar into a conflict', async () => {
      tx.schoolAcademicCalendar.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
      );

      await expect(service.create(ADMIN, CREATE_DTO)).rejects.toThrow(ConflictException);
    });
  });

  it('404s on a calendar whose pair is no longer entitled', async () => {
    policy.canRead.mockResolvedValue(false);

    await expect(service.findOne(ADMIN, 'cal-1')).rejects.toThrow(NotFoundException);
  });

  it('rejects an entry dated outside the academic year', async () => {
    await expect(
      service.addEntry(ADMIN, 'cal-1', { date: '2027-04-01', title: 'Too late' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.schoolAcademicCalendarEntry.create).not.toHaveBeenCalled();
  });

  it('refuses to publish an empty calendar', async () => {
    await expect(service.publish(ADMIN, 'cal-1')).rejects.toThrow(ConflictException);
    expect(prisma.schoolAcademicCalendar.update).not.toHaveBeenCalled();
  });

  it('404s on an entry that belongs to a different calendar', async () => {
    prisma.schoolAcademicCalendarEntry.findFirst.mockResolvedValue(null);

    await expect(service.removeEntry(ADMIN, 'cal-1', 'entry-x')).rejects.toThrow(NotFoundException);
    expect(prisma.schoolAcademicCalendarEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'entry-x', calendarId: 'cal-1' } }),
    );
  });

  describe('overview', () => {
    it('reports which plan each entitled pair resolves to', async () => {
      scope.authorizedPairs.mockResolvedValue([
        { gradeLevel: G5, subject: MATHS },
        { gradeLevel: G5, subject: SCIENCE },
        { gradeLevel: G5, subject: ENGLISH },
      ]);
      prisma.schoolAcademicCalendar.findMany.mockResolvedValue([
        { id: 'own-maths', gradeLevelId: G5.id, subjectId: MATHS.id, status: AcademicCalendarStatus.PUBLISHED },
        { id: 'own-science', gradeLevelId: G5.id, subjectId: SCIENCE.id, status: AcademicCalendarStatus.DRAFT },
      ]);
      prisma.platformAcademicCalendar.findMany.mockResolvedValue([
        { id: 'default-maths', gradeLevelId: G5.id, subjectId: MATHS.id },
        { id: 'default-science', gradeLevelId: G5.id, subjectId: SCIENCE.id },
      ]);

      const result = await service.overview(ADMIN, YEAR.id);

      expect(result.isEnabled).toBe(true);
      expect(result.rows.map((row) => [row.subject.code, row.effectiveSource])).toEqual([
        ['maths', AcademicCalendarSource.SCHOOL],
        // A draft override leaves the default in force.
        ['science', AcademicCalendarSource.PLATFORM],
        ['english', null],
      ]);
    });

    it('reports a year the school opted out of', async () => {
      prisma.schoolAcademicCalendarSetting.findFirst.mockResolvedValue({ isEnabled: false });

      await expect(service.overview(ADMIN, YEAR.id)).resolves.toMatchObject({ isEnabled: false });
    });
  });

  it('reports a never-configured year as enabled', async () => {
    const years = { getOrThrow: jest.fn(), findAll: jest.fn().mockResolvedValue([{ id: 'year-1' }, { id: 'year-2' }]) };
    prisma.schoolAcademicCalendarSetting.findMany.mockResolvedValue([{ academicYearId: 'year-2', isEnabled: false }]);
    service = new SchoolAcademicCalendarsService(
      prisma as unknown as PrismaService,
      years as unknown as AcademicYearsService,
      scope as unknown as AcademicCalendarScopeService,
      policy as unknown as SchoolAcademicCalendarAccessPolicy,
    );

    const settings = await service.listSettings();

    expect(settings.map((setting) => setting.isEnabled)).toEqual([true, false]);
  });
});
