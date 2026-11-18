import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeacherClassScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSections(actor: AuthenticatedUser): Promise<string[]> {
    if (actor.role !== Role.TEACHER) return [];
    const rows = await this.prisma.teacherAssignment.findMany({
      where: { userId: actor.sub, sectionId: { not: null } },
      select: { sectionId: true },
      distinct: ['sectionId'],
    });
    return rows.flatMap((row) => (row.sectionId === null ? [] : [row.sectionId]));
  }

  async resolveStudents(actor: AuthenticatedUser): Promise<string[]> {
    const sectionIds = await this.resolveSections(actor);
    if (sectionIds.length === 0) return [];
    const rows = await this.prisma.enrollment.findMany({
      where: { sectionId: { in: sectionIds }, status: EnrollmentStatus.ACTIVE },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((row) => row.userId);
  }

  async includesStudent(actor: AuthenticatedUser, studentId: string): Promise<boolean> {
    const studentIds = await this.resolveStudents(actor);
    return studentIds.includes(studentId);
  }
}
