import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EntitledPair {
  gradeLevelId: string;
  subjectId: string;
}

// The gate in front of platform content (F-02's reviewed exception, consumed by F-21).
// GradeLevel/Subject/Video carry no schoolId, so tenant scoping cannot restrict them
// directly; SchoolContentEntitlement is tenant-scoped and does it instead.
//
// No method here takes a school id. The tenant guard supplies it from the request
// context, so there is no parameter a caller could get wrong and no way to ask this
// service about another school's entitlements.
@Injectable()
export class ContentEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async isEntitled(gradeLevelId: string, subjectId: string): Promise<boolean> {
    const matches = await this.prisma.schoolContentEntitlement.count({
      where: { gradeLevelId, subjectId },
    });
    return matches > 0;
  }

  // For list endpoints, which filter platform content by the caller's entitlements
  // rather than checking one row at a time.
  listEntitledPairs(): Promise<EntitledPair[]> {
    return this.prisma.schoolContentEntitlement.findMany({
      select: { gradeLevelId: true, subjectId: true },
      orderBy: { grantedAt: 'asc' },
    });
  }
}
