import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentStatus } from '@prisma/client';
import { TasksService } from '../tasks/tasks.service';
import { EnrollmentsService, EnrollmentWithSection } from './enrollments.service';

type EnrollmentMock = {
  count: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

const INPUT = { schoolId: 'school-1', userId: 'student-1', sectionId: 'section-2', rollNumber: '4' };

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let enrollment: EnrollmentMock;
  let tx: { enrollment: EnrollmentMock; task: object; resourceActivity: object; taskAssignment: object; notification: object };
  let tasks: { backfillForNewEnrollment: jest.Mock };

  beforeEach(async () => {
    enrollment = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    tx = { enrollment, task: {}, resourceActivity: {}, taskAssignment: {}, notification: {} };
    tasks = { backfillForNewEnrollment: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [EnrollmentsService, { provide: TasksService, useValue: tasks }],
    }).compile();
    service = moduleRef.get(EnrollmentsService);
  });

  // The cast stands in for PrismaService's extended shape, which the mock only partly fills.
  const client = () => tx as unknown as Parameters<EnrollmentsService['enroll']>[0];

  describe('enroll', () => {
    it("makes a student's first class their current one", async () => {
      await service.enroll(client(), INPUT);

      expect(enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isCurrent: true }) }),
      );
      expect(tasks.backfillForNewEnrollment).toHaveBeenCalledWith(tx, 'school-1', 'student-1', 'section-2');
    });

    it('adds a second class without moving the student out of their current one', async () => {
      enrollment.count.mockResolvedValue(1);

      await service.enroll(client(), INPUT);

      expect(enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isCurrent: false }) }),
      );
      expect(enrollment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('replace', () => {
    it('ends the replaced class and carries its current flag to the new one', async () => {
      const current = { id: 'old', isCurrent: true } as EnrollmentWithSection;

      await service.replace(client(), current, INPUT);

      expect(enrollment.update).toHaveBeenCalledWith({
        where: { id: 'old' },
        data: { status: EnrollmentStatus.ENDED, endedAt: expect.any(Date), isCurrent: false },
      });
      expect(enrollment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sectionId: 'section-2', isCurrent: true }) }),
      );
    });
  });

  describe('end', () => {
    it('promotes the oldest remaining class when the current one ends', async () => {
      enrollment.findFirst
        .mockResolvedValueOnce({ id: 'e-current', isCurrent: true })
        .mockResolvedValueOnce({ id: 'e-oldest' });

      await service.end(client(), 'student-1', 'e-current');

      expect(enrollment.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { userId: 'student-1', status: EnrollmentStatus.ACTIVE },
          orderBy: { startedAt: 'asc' },
        }),
      );
      expect(enrollment.update).toHaveBeenLastCalledWith({ where: { id: 'e-oldest' }, data: { isCurrent: true } });
    });

    it('leaves the current class alone when another class ends', async () => {
      enrollment.findFirst.mockResolvedValueOnce({ id: 'e-other', isCurrent: false });

      await service.end(client(), 'student-1', 'e-other');

      expect(enrollment.update).toHaveBeenCalledTimes(1);
      expect(enrollment.findFirst).toHaveBeenCalledTimes(1);
    });

    it("refuses another student's or an already-ended enrollment with a 404", async () => {
      enrollment.findFirst.mockResolvedValueOnce(null);

      await expect(service.end(client(), 'student-1', 'someone-else')).rejects.toBeInstanceOf(NotFoundException);
      expect(enrollment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'someone-else', userId: 'student-1', status: EnrollmentStatus.ACTIVE } }),
      );
      expect(enrollment.update).not.toHaveBeenCalled();
    });
  });

  describe('switchCurrent', () => {
    it('clears the old current class before setting the new one', async () => {
      enrollment.findFirst.mockResolvedValueOnce({ id: 'e-target', isCurrent: false });

      await service.switchCurrent(client(), 'student-1', 'e-target');

      expect(enrollment.updateMany).toHaveBeenCalledWith({
        where: { userId: 'student-1', status: EnrollmentStatus.ACTIVE, isCurrent: true },
        data: { isCurrent: false },
      });
      expect(enrollment.update).toHaveBeenCalledWith({ where: { id: 'e-target' }, data: { isCurrent: true } });
      expect(enrollment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        enrollment.update.mock.invocationCallOrder[0],
      );
    });

    it('is a no-op when the target is already current', async () => {
      enrollment.findFirst.mockResolvedValueOnce({ id: 'e-target', isCurrent: true });

      await service.switchCurrent(client(), 'student-1', 'e-target');

      expect(enrollment.updateMany).not.toHaveBeenCalled();
      expect(enrollment.update).not.toHaveBeenCalled();
    });

    it("refuses an enrollment that is not one of the student's own active classes", async () => {
      enrollment.findFirst.mockResolvedValueOnce(null);

      await expect(service.switchCurrent(client(), 'student-1', 'other')).rejects.toBeInstanceOf(NotFoundException);
      expect(enrollment.updateMany).not.toHaveBeenCalled();
    });
  });
});
