import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOnly } from './academic-calendar-dates.util';
import { AcademicYearsService } from './academic-years.service';

const YEAR = {
  id: 'year-1',
  label: '2026-2027',
  startDate: parseDateOnly('2026-06-01'),
  endDate: parseDateOnly('2027-03-31'),
};

describe('AcademicYearsService', () => {
  let service: AcademicYearsService;
  let prisma: {
    academicYear: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    platformAcademicCalendarEntry: { count: jest.Mock };
    schoolAcademicCalendarEntry: { count: jest.Mock };
    platformAcademicCalendar: { count: jest.Mock };
    schoolAcademicCalendar: { count: jest.Mock };
    schoolAcademicCalendarSetting: { count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(YEAR),
        create: jest.fn().mockResolvedValue(YEAR),
        update: jest.fn().mockResolvedValue(YEAR),
        delete: jest.fn(),
      },
      platformAcademicCalendarEntry: { count: jest.fn().mockResolvedValue(0) },
      schoolAcademicCalendarEntry: { count: jest.fn().mockResolvedValue(0) },
      platformAcademicCalendar: { count: jest.fn().mockResolvedValue(0) },
      schoolAcademicCalendar: { count: jest.fn().mockResolvedValue(0) },
      schoolAcademicCalendarSetting: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
    };
    service = new AcademicYearsService(prisma as unknown as PrismaService);
  });

  it('serialises dates as YYYY-MM-DD', async () => {
    await expect(
      service.create({ label: '2026-2027', startDate: '2026-06-01', endDate: '2027-03-31' }),
    ).resolves.toEqual({ id: 'year-1', label: '2026-2027', startDate: '2026-06-01', endDate: '2027-03-31' });
  });

  it('rejects a year that ends before it starts', async () => {
    await expect(
      service.create({ label: 'Backwards', startDate: '2027-03-31', endDate: '2026-06-01' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.academicYear.create).not.toHaveBeenCalled();
  });

  it('turns a duplicate label into a conflict', async () => {
    prisma.academicYear.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(
      service.create({ label: '2026-2027', startDate: '2026-06-01', endDate: '2027-03-31' }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to narrow a year while school entries fall outside the new dates', async () => {
    prisma.schoolAcademicCalendarEntry.count.mockResolvedValue(3);

    await expect(service.update('year-1', { endDate: '2027-01-31' })).rejects.toThrow(ConflictException);
    expect(prisma.schoolAcademicCalendarEntry.count).toHaveBeenCalledWith({
      where: {
        calendar: { academicYearId: 'year-1' },
        OR: [{ date: { lt: YEAR.startDate } }, { date: { gt: parseDateOnly('2027-01-31') } }],
      },
    });
    expect(prisma.academicYear.update).not.toHaveBeenCalled();
  });

  it('narrows a year when every entry still fits', async () => {
    await service.update('year-1', { endDate: '2027-01-31' });

    expect(prisma.academicYear.update).toHaveBeenCalled();
  });

  it('404s when updating a year that does not exist', async () => {
    prisma.academicYear.findUnique.mockResolvedValue(null);

    await expect(service.update('nope', { label: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('refuses to delete a year a school has configured', async () => {
    prisma.schoolAcademicCalendarSetting.count.mockResolvedValue(1);

    await expect(service.remove('year-1')).rejects.toThrow(ConflictException);
    expect(prisma.academicYear.delete).not.toHaveBeenCalled();
  });

  it('deletes a year nothing references', async () => {
    await service.remove('year-1');

    expect(prisma.academicYear.delete).toHaveBeenCalledWith({ where: { id: 'year-1' } });
  });
});
