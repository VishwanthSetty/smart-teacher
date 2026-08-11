import { Role } from '@prisma/client';
import { ActorContentScopeService } from '../entitlements/actor-content-scope.service';
import { DocumentsAccessPolicy } from './documents-access.policy';

describe('DocumentsAccessPolicy', () => {
  it('delegates the curriculum decision to the shared actor scope', async () => {
    const contentScope = { includes: jest.fn().mockResolvedValue(true) };
    const policy = new DocumentsAccessPolicy(contentScope as unknown as ActorContentScopeService);
    const actor = { userId: 'teacher-1', role: Role.TEACHER, schoolId: 'school-1' };

    await expect(policy.canRead(actor, { curriculumId: 'curriculum-1' })).resolves.toBe(true);
    expect(contentScope.includes).toHaveBeenCalledWith(actor, 'curriculum-1');
  });
});
