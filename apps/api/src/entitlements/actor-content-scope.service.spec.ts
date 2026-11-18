import { Test, TestingModule } from '@nestjs/testing';
import { ContentAudience, Role } from '@prisma/client';
import type { ActorScope } from '../common/authorization/resource-access';
import { ContentEntitlementsService } from './content-entitlements.service';
import { ActorContentScopeService } from './actor-content-scope.service';
import { EnrollmentLookupService } from '../students/enrollment-lookup.service';
import { TeacherAssignmentsService } from '../teachers/teacher-assignments.service';

const G5_MATHS = { curriculumId: 'c-g5-maths', gradeLevelId: 'g5', subjectId: 'maths', audience: ContentAudience.STUDENT };
const G6_SCIENCE = { curriculumId: 'c-g6-science', gradeLevelId: 'g6', subjectId: 'science', audience: ContentAudience.STUDENT };
const TEACHER_MATHS = { curriculumId: 'c-teacher-maths', gradeLevelId: 'g5', subjectId: 'maths', audience: ContentAudience.TEACHER };

function actor(role: Role, schoolId: string | null = 'school-a'): ActorScope {
  return { userId: 'u1', role, schoolId };
}

describe('ActorContentScopeService', () => {
  let service: ActorContentScopeService;
  let entitlements: { listEntitledCurricula: jest.Mock; isEntitled: jest.Mock };
  let enrollments: { activeGradeLevelIdsFor: jest.Mock; currentGradeLevelIdFor: jest.Mock };
  let teacherAssignments: { taughtPairsFor: jest.Mock };

  beforeEach(async () => {
    entitlements = { listEntitledCurricula: jest.fn(), isEntitled: jest.fn() };
    // A TEACHER path never calls this — only asserted in the STUDENT-specific tests.
    enrollments = {
      activeGradeLevelIdsFor: jest.fn().mockResolvedValue([]),
      currentGradeLevelIdFor: jest.fn().mockResolvedValue(null),
    };
    teacherAssignments = { taughtPairsFor: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActorContentScopeService,
        { provide: ContentEntitlementsService, useValue: entitlements },
        { provide: EnrollmentLookupService, useValue: enrollments },
        { provide: TeacherAssignmentsService, useValue: teacherAssignments },
      ],
    }).compile();

    service = module.get(ActorContentScopeService);
  });

  it("resolves SUPER_ADMIN to the whole library without reading any school's entitlements", async () => {
    const scope = await service.resolve(actor(Role.SUPER_ADMIN, null));

    expect(scope).toBe('all');
    expect(entitlements.listEntitledCurricula).not.toHaveBeenCalled();
  });

  it("resolves an in-school role to that school's entitled curricula", async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([G5_MATHS.curriculumId]);
  });

  it('resolves a school with no entitlements to an empty scope, not an unrestricted one', async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([]);

    const scope = await service.resolve(actor(Role.STUDENT));

    expect(scope).toEqual([]);
    expect(scope).not.toBe('all');
  });

  it('keeps the full entitlement set for a teacher with no grade-bearing assignment', async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([
      G5_MATHS.curriculumId,
      G6_SCIENCE.curriculumId,
    ]);
    expect(teacherAssignments.taughtPairsFor).toHaveBeenCalledWith('u1');
    expect(enrollments.activeGradeLevelIdsFor).not.toHaveBeenCalled();
  });

  it('narrows student-audience curricula to the grade and subject pairs a teacher teaches', async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
    teacherAssignments.taughtPairsFor.mockResolvedValue([
      { gradeLevelId: 'g5', subjectId: 'maths' },
    ]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([G5_MATHS.curriculumId]);
  });

  it('keeps every entitled teacher-audience curriculum after assignment narrowing begins', async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE, TEACHER_MATHS]);
    teacherAssignments.taughtPairsFor.mockResolvedValue([
      { gradeLevelId: 'g6', subjectId: 'science' },
    ]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([
      G6_SCIENCE.curriculumId,
      TEACHER_MATHS.curriculumId,
    ]);
  });

  it("grants SCHOOL_ADMIN the school's full entitlement set", async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

    expect(await service.resolve(actor(Role.SCHOOL_ADMIN))).toEqual([
      G5_MATHS.curriculumId,
      G6_SCIENCE.curriculumId,
    ]);
    expect(enrollments.activeGradeLevelIdsFor).not.toHaveBeenCalled();
  });

  describe('STUDENT narrowing', () => {
    it("narrows to the student's enrolled grade level, intersected with the school's entitlements", async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE, TEACHER_MATHS]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue(['g5']);

      const scope = await service.resolve(actor(Role.STUDENT));

      expect(scope).toEqual([G5_MATHS.curriculumId]);
      expect(enrollments.activeGradeLevelIdsFor).toHaveBeenCalledWith('u1');
    });

    it('never includes a teacher-audience curriculum even when its grade matches', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, TEACHER_MATHS]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue(['g5']);

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([G5_MATHS.curriculumId]);
      expect(await service.includes(actor(Role.STUDENT), TEACHER_MATHS.curriculumId)).toBe(false);
    });

    // Failing open here would hand an unplaced student the whole school library.
    it('resolves a student with no active enrollment to an empty scope, not the school-wide set', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue([]);

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([]);
    });

    it('resolves an enrolled student to an empty scope when their grade level has no entitlement', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G6_SCIENCE]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue(['g5']);

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([]);
    });

    // A task or notification for one class must still open while another is selected.
    it('authorizes every grade a multi-class student is enrolled in, whichever class is current', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue(['g5', 'g6']);
      enrollments.currentGradeLevelIdFor.mockResolvedValue('g5');

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([
        G5_MATHS.curriculumId,
        G6_SCIENCE.curriculumId,
      ]);
      expect(await service.includes(actor(Role.STUDENT), G6_SCIENCE.curriculumId)).toBe(true);
    });
  });

  describe('resolveBrowse', () => {
    it("narrows a multi-class student's browse scope to the current class's grade", async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue(['g5', 'g6']);
      enrollments.currentGradeLevelIdFor.mockResolvedValue('g6');

      expect(await service.resolveBrowse(actor(Role.STUDENT))).toEqual([G6_SCIENCE.curriculumId]);
    });

    it('resolves an unplaced student to an empty browse scope', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

      expect(await service.resolveBrowse(actor(Role.STUDENT))).toEqual([]);
    });

    it('matches resolve for every non-student role', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

      expect(await service.resolveBrowse(actor(Role.SCHOOL_ADMIN))).toEqual(
        await service.resolve(actor(Role.SCHOOL_ADMIN)),
      );
      expect(await service.resolveBrowse(actor(Role.SUPER_ADMIN, null))).toBe('all');
      expect(enrollments.currentGradeLevelIdFor).not.toHaveBeenCalled();
    });
  });

  describe('includes', () => {
    it('admits any curriculum for SUPER_ADMIN', async () => {
      expect(await service.includes(actor(Role.SUPER_ADMIN, null), 'c-g9-art')).toBe(true);
    });

    it('admits a curriculum inside the entitlement set', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS]);

      expect(await service.includes(actor(Role.TEACHER), G5_MATHS.curriculumId)).toBe(true);
    });

    it('refuses a curriculum outside the entitlement set', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS]);

      expect(await service.includes(actor(Role.TEACHER), G6_SCIENCE.curriculumId)).toBe(false);
    });

    // A student narrowed out of a curriculum must not regain it through the single-read
    // path — the exact drift `includes`-derives-from-`resolve` exists to prevent.
    it("refuses a curriculum the school holds but the student's grade level excludes", async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdsFor.mockResolvedValue(['g5']);

      expect(await service.includes(actor(Role.STUDENT), G6_SCIENCE.curriculumId)).toBe(false);
    });

    // Otherwise a narrowing added to `resolve` would not reach single-video reads,
    // leaving GET /videos/:id wider than GET /videos.
    it('derives its answer from resolve, so future narrowing applies to single reads too', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS]);

      await service.includes(actor(Role.TEACHER), G5_MATHS.curriculumId);

      expect(entitlements.listEntitledCurricula).toHaveBeenCalled();
      expect(entitlements.isEntitled).not.toHaveBeenCalled();
    });
  });
});
