import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CurriculumStatus, SubjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContentNodeUsabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNodeUsable(
    contentNodeId: string,
    contentLabel: 'Videos' | 'Documents',
  ): Promise<void> {
    const node = await this.prisma.contentNode.findUnique({
      where: { id: contentNodeId },
      select: {
        depth: true,
        curriculum: {
          select: {
            status: true,
            subject: { select: { status: true } },
            schema: { select: { levels: { select: { depth: true, canHoldContent: true } } } },
          },
        },
      },
    });
    if (node === null) throw new NotFoundException('Content node not found');
    if (node.curriculum.subject.status === SubjectStatus.RETIRED) {
      throw new ConflictException('This subject is retired and cannot take new content');
    }
    if (node.curriculum.status === CurriculumStatus.ARCHIVED) {
      throw new ConflictException('This curriculum is archived and cannot take new content');
    }
    const level = node.curriculum.schema.levels.find((candidate) => candidate.depth === node.depth);
    if (level === undefined || !level.canHoldContent) {
      throw new ConflictException(`${contentLabel} cannot be attached at this level of the curriculum`);
    }
  }
}
