import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AcademicCalendarStatus, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOnly } from './academic-calendar-dates.util';
import { PlatformAcademicCalendarsService } from './platform-academic-calendars.service';

const YEAR = {
  id: 'year-1',
  label: '2026-2027',
  startDate: parseDateOnly('2026-06-01'),
  endDate: parseDateOnly('2027-03-31'),
};

describe('PlatformAcademicCalendarsService', () => {
  let service: PlatformAcademicCalendarsService;
  let prisma: {
    academicYear: { findUnique: jest.Mock };
    gradeLevel: { findUnique: jest.Mock };
    subject: { findUnique: jest.Mock };
    platformAcademicCalendar: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    platformAcademicCalendarEntry: { count: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: YEAR.id }) },
      gradeLevel: { findUnique: jest.fn().mockResolvedValue({ id: 'g5' }) },
      subject: { findUnique: jest.fn().mockResolvedValue({ status: SubjectStatus.ACTIVE }) },
      platformAcademicCalendar: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cal-1',
          status: AcademicCalendarStatus.DRAFT,
          academicYear: YEAR,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      platformAcademicCalendarEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1' }),
        update: jest.fn(),
      },
    };
    service = new PlatformAcademicCalendarsService(prisma as unknown as PrismaService);
  });

  it('refuses a default calendar for a retired subject', async () => {
    prisma.subject.findUnique.mockResolvedValue({ status: SubjectStatus.RETIRED });

    await expect(
      service.create({ academicYearId: YEAR.id, gradeLevelId: 'g5', subjectId: 'latin' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.platformAcademicCalendar.create).not.toHaveBeenCalled();
  });

  it('404s when the year, grade or subject does not exist', async () => {
    prisma.gradeLevel.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ academicYearId: YEAR.id, gradeLevelId: 'nope', subjectId: 'maths' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to publish an empty default', async () => {
    await expect(service.publish('cal-1')).rejects.toThrow('at least one entry');
    expect(prisma.platformAcademicCalendar.update).not.toHaveBeenCalled();
  });

  it('refuses to unpublish a draft', async () => {
    await expect(service.unpublish('cal-1')).rejects.toThrow(ConflictException);
  });

  it('rejects an entry dated before the academic year', async () => {
    await expect(service.addEntry('cal-1', { date: '2026-05-31', title: 'Early' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.platformAcademicCalendarEntry.create).not.toHaveBeenCalled();
  });

  it('accepts entries on the first and last day of the year', async () => {
    prisma.platformAcademicCalendarEntry.create.mockResolvedValue({
      id: 'entry-1',
      date: YEAR.endDate,
      title: 'Revision',
      description: null,
    });

    await service.addEntry('cal-1', { date: '2026-06-01', title: 'Kick-off' });
    await expect(service.addEntry('cal-1', { date: '2027-03-31', title: 'Revision' })).resolves.toMatchObject({
      date: '2027-03-31',
    });
  });

  it('validates a moved entry against the academic year', async () => {
    await expect(service.updateEntry('cal-1', 'entry-1', { date: '2027-04-01' })).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.platformAcademicCalendarEntry.update).not.toHaveBeenCalled();
  });

  it('404s on an entry that belongs to a different calendar', async () => {
    prisma.platformAcademicCalendarEntry.findFirst.mockResolvedValue(null);

    await expect(service.updateEntry('cal-1', 'entry-x', { title: 'x' })).rejects.toThrow(NotFoundException);
  });
});
