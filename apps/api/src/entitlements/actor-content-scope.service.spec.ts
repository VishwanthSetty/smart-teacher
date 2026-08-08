import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { ActorScope } from '../common/authorization/resource-access';
import { ContentEntitlementsService } from './content-entitlements.service';
import { ActorContentScopeService } from './actor-content-scope.service';
import { EnrollmentsService } from '../students/enrollments.service';

const G5_MATHS = { curriculumId: 'c-g5-maths', gradeLevelId: 'g5' };
const G6_SCIENCE = { curriculumId: 'c-g6-science', gradeLevelId: 'g6' };

function actor(role: Role, schoolId: string | null = 'school-a'): ActorScope {
  return { userId: 'u1', role, schoolId };
}

describe('ActorContentScopeService', () => {
  let service: ActorContentScopeService;
  let entitlements: { listEntitledCurricula: jest.Mock; isEntitled: jest.Mock };
  let enrollments: { activeGradeLevelIdFor: jest.Mock };

  beforeEach(async () => {
    entitlements = { listEntitledCurricula: jest.fn(), isEntitled: jest.fn() };
    // A TEACHER path never calls this — only asserted in the STUDENT-specific tests.
    enrollments = { activeGradeLevelIdFor: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActorContentScopeService,
        { provide: ContentEntitlementsService, useValue: entitlements },
        { provide: EnrollmentsService, useValue: enrollments },
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

  // TEACHER narrowing (only the subjects they teach) still needs section-level teacher
  // assignments, which TeacherAssignment does not carry yet — deferred, not done here.
  it('grants TEACHER the full entitlement set — per-subject narrowing still pending', async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([
      G5_MATHS.curriculumId,
      G6_SCIENCE.curriculumId,
    ]);
    expect(enrollments.activeGradeLevelIdFor).not.toHaveBeenCalled();
  });

  it("grants SCHOOL_ADMIN the school's full entitlement set", async () => {
    entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

    expect(await service.resolve(actor(Role.SCHOOL_ADMIN))).toEqual([
      G5_MATHS.curriculumId,
      G6_SCIENCE.curriculumId,
    ]);
    expect(enrollments.activeGradeLevelIdFor).not.toHaveBeenCalled();
  });

  describe('STUDENT narrowing', () => {
    it("narrows to the student's enrolled grade level, intersected with the school's entitlements", async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdFor.mockResolvedValue('g5');

      const scope = await service.resolve(actor(Role.STUDENT));

      expect(scope).toEqual([G5_MATHS.curriculumId]);
      expect(enrollments.activeGradeLevelIdFor).toHaveBeenCalledWith('u1');
    });

    // Failing open here would hand an unplaced student the whole school library.
    it('resolves a student with no active enrollment to an empty scope, not the school-wide set', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdFor.mockResolvedValue(null);

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([]);
    });

    it('resolves an enrolled student to an empty scope when their grade level has no entitlement', async () => {
      entitlements.listEntitledCurricula.mockResolvedValue([G6_SCIENCE]);
      enrollments.activeGradeLevelIdFor.mockResolvedValue('g5');

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([]);
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
      enrollments.activeGradeLevelIdFor.mockResolvedValue('g5');

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
