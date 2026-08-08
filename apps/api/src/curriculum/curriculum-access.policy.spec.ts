import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { requireReadable, type ActorScope } from '../common/authorization/resource-access';
import { CurriculumAccessPolicy } from './curriculum-access.policy';

const CURRICULUM = { id: 'curriculum-1' };
const TEACHER: ActorScope = { userId: 'u1', role: Role.TEACHER, schoolId: 'school-a' };

describe('CurriculumAccessPolicy', () => {
  let policy: CurriculumAccessPolicy;
  let contentScope: { includes: jest.Mock; resolve: jest.Mock };

  beforeEach(async () => {
    contentScope = { includes: jest.fn(), resolve: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumAccessPolicy,
        { provide: ActorContentScopeService, useValue: contentScope },
      ],
    }).compile();

    policy = module.get(CurriculumAccessPolicy);
  });

  it("allows a curriculum inside the actor's content scope", async () => {
    contentScope.includes.mockResolvedValue(true);

    await expect(policy.canRead(TEACHER, CURRICULUM)).resolves.toBe(true);
    expect(contentScope.includes).toHaveBeenCalledWith(TEACHER, 'curriculum-1');
  });

  it('denies a curriculum outside it', async () => {
    contentScope.includes.mockResolvedValue(false);

    await expect(policy.canRead(TEACHER, CURRICULUM)).resolves.toBe(false);
  });

  // The reason the policy exists: curricula are platform-global, so a denial must be
  // indistinguishable from a missing row rather than confirming the curriculum exists.
  it('surfaces an unentitled curriculum as 404, not 403, through requireReadable', async () => {
    contentScope.includes.mockResolvedValue(false);

    await expect(
      requireReadable(CURRICULUM, TEACHER, policy, 'Curriculum not found'),
    ).rejects.toThrow(NotFoundException);
  });
});
