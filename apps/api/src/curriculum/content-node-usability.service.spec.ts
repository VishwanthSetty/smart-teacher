import { ConflictException, NotFoundException } from '@nestjs/common';
import { CurriculumStatus, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentNodeUsabilityService } from './content-node-usability.service';

describe('ContentNodeUsabilityService', () => {
  const findUnique = jest.fn();
  const service = new ContentNodeUsabilityService({ contentNode: { findUnique } } as unknown as PrismaService);

  beforeEach(() => findUnique.mockReset());

  it('accepts a live content-holding level', async () => {
    findUnique.mockResolvedValue({
      depth: 2,
      curriculum: {
        status: CurriculumStatus.DRAFT,
        subject: { status: SubjectStatus.ACTIVE },
        schema: { levels: [{ depth: 2, canHoldContent: true }] },
      },
    });
    await expect(service.assertNodeUsable('node-1', 'Documents')).resolves.toBeUndefined();
  });

  it('uses the caller label when the level cannot hold content', async () => {
    findUnique.mockResolvedValue({
      depth: 1,
      curriculum: {
        status: CurriculumStatus.DRAFT,
        subject: { status: SubjectStatus.ACTIVE },
        schema: { levels: [{ depth: 1, canHoldContent: false }] },
      },
    });
    await expect(service.assertNodeUsable('node-1', 'Documents')).rejects.toThrow(
      'Documents cannot be attached at this level of the curriculum',
    );
  });

  it('404s an unknown node', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.assertNodeUsable('missing', 'Videos')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses archived curricula', async () => {
    findUnique.mockResolvedValue({
      depth: 2,
      curriculum: {
        status: CurriculumStatus.ARCHIVED,
        subject: { status: SubjectStatus.ACTIVE },
        schema: { levels: [{ depth: 2, canHoldContent: true }] },
      },
    });
    await expect(service.assertNodeUsable('node-1', 'Videos')).rejects.toBeInstanceOf(ConflictException);
  });
});
