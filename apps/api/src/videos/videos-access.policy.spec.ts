import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { requireReadable, type ActorScope } from '../common/authorization/resource-access';
import { VideosAccessPolicy } from './videos-access.policy';

const VIDEO = { curriculumId: 'c-g5-maths' };
const TEACHER: ActorScope = { userId: 'u1', role: Role.TEACHER, schoolId: 'school-a' };
const SCHOOL_ADMIN: ActorScope = { userId: 'u2', role: Role.SCHOOL_ADMIN, schoolId: 'school-a' };
const SUPER_ADMIN: ActorScope = { userId: 'u0', role: Role.SUPER_ADMIN, schoolId: null };

describe('VideosAccessPolicy', () => {
  let policy: VideosAccessPolicy;
  let contentScope: { includes: jest.Mock; resolve: jest.Mock };

  beforeEach(async () => {
    contentScope = { includes: jest.fn(), resolve: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideosAccessPolicy,
        { provide: ActorContentScopeService, useValue: contentScope },
      ],
    }).compile();

    policy = module.get(VideosAccessPolicy);
  });

  it("allows a video inside the actor's content scope", async () => {
    contentScope.includes.mockResolvedValue(true);

    await expect(policy.canRead(TEACHER, VIDEO)).resolves.toBe(true);
    expect(contentScope.includes).toHaveBeenCalledWith(TEACHER, 'c-g5-maths');
  });

  it('denies a video outside it', async () => {
    contentScope.includes.mockResolvedValue(false);

    await expect(policy.canRead(TEACHER, VIDEO)).resolves.toBe(false);
  });

  it("checks a SCHOOL_ADMIN against the school's content scope", async () => {
    contentScope.includes.mockResolvedValue(true);

    await expect(policy.canRead(SCHOOL_ADMIN, VIDEO)).resolves.toBe(true);
    expect(contentScope.includes).toHaveBeenCalledWith(SCHOOL_ADMIN, 'c-g5-maths');
  });

  it('allows SUPER_ADMIN, who holds no entitlements to check against', async () => {
    contentScope.includes.mockResolvedValue(true);

    await expect(policy.canRead(SUPER_ADMIN, VIDEO)).resolves.toBe(true);
  });

  // The reason the policy exists: videos are platform-global, so a denial must be
  // indistinguishable from a missing row rather than confirming the video exists.
  it('surfaces an unentitled video as 404, not 403, through requireReadable', async () => {
    contentScope.includes.mockResolvedValue(false);

    await expect(requireReadable(VIDEO, TEACHER, policy, 'Video not found')).rejects.toThrow(
      NotFoundException,
    );
  });
});
