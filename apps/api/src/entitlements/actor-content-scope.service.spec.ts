import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import type { ActorScope } from '../common/authorization/resource-access';
import { ContentEntitlementsService } from './content-entitlements.service';
import { ActorContentScopeService } from './actor-content-scope.service';

const G5_MATHS = { gradeLevelId: 'g5', subjectId: 'maths' };
const G6_SCIENCE = { gradeLevelId: 'g6', subjectId: 'science' };

function actor(role: Role, schoolId: string | null = 'school-a'): ActorScope {
  return { userId: 'u1', role, schoolId };
}

describe('ActorContentScopeService', () => {
  let service: ActorContentScopeService;
  let entitlements: { listEntitledPairs: jest.Mock; isEntitled: jest.Mock };

  beforeEach(async () => {
    entitlements = { listEntitledPairs: jest.fn(), isEntitled: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActorContentScopeService,
        { provide: ContentEntitlementsService, useValue: entitlements },
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

  // F-06 specifies narrowing a teacher to the pairs they teach and a student to their
  // enrolled section's grade level. Both need F-08's assignment/enrollment models, so
  // today every in-school role sees the school's full entitlement set. This test records
  // that deliberate widening: when F-08 narrows `resolve`, it should fail and be updated.
  it('currently grants every in-school role the full entitlement set — per-actor narrowing lands with F-08', async () => {
    entitlements.listEntitledPairs.mockResolvedValue([G5_MATHS, G6_SCIENCE]);

    expect(await service.resolve(actor(Role.TEACHER))).toEqual([G5_MATHS, G6_SCIENCE]);
    expect(await service.resolve(actor(Role.STUDENT))).toEqual([G5_MATHS, G6_SCIENCE]);
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
