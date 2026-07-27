import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let users: { countMembership: jest.Mock };

  beforeEach(async () => {
    users = { countMembership: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [StatsService, { provide: UsersService, useValue: users }],
    }).compile();

    service = module.get(StatsService);
  });

  it('passes the membership counts through unchanged', async () => {
    users.countMembership.mockResolvedValue({ students: 42, teachers: 7, pendingInvites: 3 });

    const summary = await service.getSummary();

    expect(summary).toMatchObject({ students: 42, teachers: 7, pendingInvites: 3 });
  });

  it('reports classes and latest timetable as null, never zero, while those models are unbuilt', async () => {
    users.countMembership.mockResolvedValue({ students: 0, teachers: 0, pendingInvites: 0 });

    const summary = await service.getSummary();

    expect(summary.classes).toBeNull();
    expect(summary.latestTimetable).toBeNull();
  });
});
