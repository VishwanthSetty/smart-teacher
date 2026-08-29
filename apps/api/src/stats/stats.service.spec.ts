import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { SectionsService } from '../students/sections.service';
import { SchoolsService } from '../schools/schools.service';
import { CurriculaService } from '../curriculum/curricula.service';
import { VideosService } from '../videos/videos.service';
import { DocumentsService } from '../documents/documents.service';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let users: { countMembership: jest.Mock };
  let sections: { countAll: jest.Mock };
  let schools: { getPlatformOverview: jest.Mock };
  let curricula: { countAll: jest.Mock };
  let videos: { getPlatformPipeline: jest.Mock };
  let documents: { countAll: jest.Mock };

  beforeEach(async () => {
    users = { countMembership: jest.fn() };
    sections = { countAll: jest.fn() };
    schools = { getPlatformOverview: jest.fn() };
    curricula = { countAll: jest.fn() };
    videos = { getPlatformPipeline: jest.fn() };
    documents = { countAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: UsersService, useValue: users },
        { provide: SectionsService, useValue: sections },
        { provide: SchoolsService, useValue: schools },
        { provide: CurriculaService, useValue: curricula },
        { provide: VideosService, useValue: videos },
        { provide: DocumentsService, useValue: documents },
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

  it('composes platform totals, recent schools, and the content pipeline', async () => {
    schools.getPlatformOverview.mockResolvedValue({
      total: 2,
      recent: [{ id: 'school-1', name: 'Oakridge', slug: 'oakridge', status: 'ACTIVE' }],
    });
    curricula.countAll.mockResolvedValue(3);
    videos.getPlatformPipeline.mockResolvedValue({ total: 4, ready: 3, processing: 0, queued: 0, failed: 1 });
    documents.countAll.mockResolvedValue(5);

    await expect(service.getPlatformSummary()).resolves.toEqual({
      schools: 2,
      curricula: 3,
      videos: 4,
      documents: 5,
      recentSchools: [{ id: 'school-1', name: 'Oakridge', slug: 'oakridge', status: 'ACTIVE' }],
      contentPipeline: { ready: 3, processing: 0, queued: 0, failed: 1 },
    });
  });
});
