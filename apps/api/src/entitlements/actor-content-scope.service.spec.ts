import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { ActorScope } from '../common/authorization/resource-access';
import { ContentEntitlementsService } from './content-entitlements.service';
import { ActorContentScopeService } from './actor-content-scope.service';
import { EnrollmentsService } from '../students/enrollments.service';

const G5_MATHS = { gradeLevelId: 'g5', subjectId: 'maths' };
const G6_SCIENCE = { gradeLevelId: 'g6', subjectId: 'science' };

function actor(role: Role, schoolId: string | null = 'school-a'): ActorScope {
  return { userId: 'u1', role, schoolId };
}

describe('ActorContentScopeService', () => {
  let service: ActorContentScopeService;
  let entitlements: { listEntitledPairs: jest.Mock; isEntitled: jest.Mock };
  let enrollments: { activeGradeLevelIdFor: jest.Mock };

  beforeEach(async () => {
    entitlements = { listEntitledPairs: jest.fn(), isEntitled: jest.fn() };
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
    expect(entitlements.listEntitledPairs).not.toHaveBeenCalled();
  });

  it("resolves an in-school role to that school's entitled pairs", async () => {
    entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([G5_MATHS]);
  });

  it('resolves a school with no entitlements to an empty scope, not an unrestricted one', async () => {
    entitlements.listEntitledPairs.mockResolvedValue([]);

    const scope = await service.resolve(actor(Role.STUDENT));

    expect(scope).toEqual([]);
    expect(scope).not.toBe('all');
  });

  // TEACHER narrowing (only the pairs they teach) still needs section-level teacher
  // assignments, which TeacherAssignment does not carry yet — deferred, not done here.
  it('grants TEACHER the full entitlement set — per-subject narrowing still pending', async () => {
    entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([G5_MATHS, G6_SCIENCE]);
    expect(enrollments.activeGradeLevelIdFor).not.toHaveBeenCalled();
  });

  describe('STUDENT narrowing', () => {
    it("narrows to the student's enrolled grade level, intersected with the school's entitlements", async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdFor.mockResolvedValue('g5');

      const scope = await service.resolve(actor(Role.STUDENT));

      expect(scope).toEqual([G5_MATHS]);
      expect(enrollments.activeGradeLevelIdFor).toHaveBeenCalledWith('u1');
    });

    // Failing open here would hand an unplaced student the whole school library.
    it('resolves a student with no active enrollment to an empty scope, not the school-wide set', async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS, G6_SCIENCE]);
      enrollments.activeGradeLevelIdFor.mockResolvedValue(null);

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([]);
    });

    it('resolves an enrolled student to an empty scope when their grade level has no entitlement', async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G6_SCIENCE]);
      enrollments.activeGradeLevelIdFor.mockResolvedValue('g5');

      expect(await service.resolve(actor(Role.STUDENT))).toEqual([]);
    });
  });

  describe('includes', () => {
    it('admits any pair for SUPER_ADMIN', async () => {
      expect(await service.includes(actor(Role.SUPER_ADMIN, null), 'g9', 'art')).toBe(true);
    });

    it('admits a pair inside the entitlement set', async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS]);

      expect(await service.includes(actor(Role.TEACHER), 'g5', 'maths')).toBe(true);
    });

    it('refuses a pair outside the entitlement set', async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS]);

      expect(await service.includes(actor(Role.TEACHER), 'g6', 'science')).toBe(false);
    });

    // Grade level and subject must match on the same row. Matching them independently
    // would let a school entitled to (G5, Maths) and (G6, Science) reach (G5, Science).
    it('refuses a pair whose halves come from two different entitlements', async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

      expect(await service.includes(actor(Role.TEACHER), 'g5', 'science')).toBe(false);
    });

    // Otherwise a narrowing added to `resolve` would not reach single-video reads,
    // leaving GET /videos/:id wider than GET /videos.
    it('derives its answer from resolve, so future narrowing applies to single reads too', async () => {
      entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS]);

      await service.includes(actor(Role.TEACHER), 'g5', 'maths');

      expect(entitlements.listEntitledPairs).toHaveBeenCalled();
      expect(entitlements.isEntitled).not.toHaveBeenCalled();
    });
  });
});
