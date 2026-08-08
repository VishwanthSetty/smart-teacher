import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { SectionsService } from '../students/sections.service';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let users: { countMembership: jest.Mock };
  let sections: { countAll: jest.Mock };

  beforeEach(async () => {
    users = { countMembership: jest.fn() };
    sections = { countAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: UsersService, useValue: users },
        { provide: SectionsService, useValue: sections },
      ],
    }).compile();

    service = module.get(StatsService);
  });

  it('passes the membership counts through unchanged', async () => {
    users.countMembership.mockResolvedValue({ students: 42, teachers: 7, pendingInvites: 3 });
    sections.countAll.mockResolvedValue(4);

    const summary = await service.getSummary();

    expect(summary).toMatchObject({ students: 42, teachers: 7, pendingInvites: 3 });
  });

  it('reports the section count as classes and leaves the unbuilt timetable null', async () => {
    users.countMembership.mockResolvedValue({ students: 0, teachers: 0, pendingInvites: 0 });
    sections.countAll.mockResolvedValue(3);

    const summary = await service.getSummary();

    expect(summary.classes).toBe(3);
    expect(summary.latestTimetable).toBeNull();
  });
});
