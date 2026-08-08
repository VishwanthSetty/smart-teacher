import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CreateSectionDto } from './dto/create-section.dto';
import { SectionEntity } from './entities/section.entity';

const SECTION_INCLUDE = {
  gradeLevel: { select: { id: true, name: true, rank: true } },
  _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
} as const;

type SectionWithCount = Prisma.SectionGetPayload<{ include: typeof SECTION_INCLUDE }>;

function toEntity(section: SectionWithCount): SectionEntity {
  return {
    id: section.id,
    name: section.name,
    gradeLevelId: section.gradeLevel.id,
    gradeLevelName: section.gradeLevel.name,
    label: `${section.gradeLevel.name} - ${section.name}`,
    studentCount: section._count.enrollments,
  };
}

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  countAll(): Promise<number> {
    return this.prisma.section.count();
  }

  async findAll(): Promise<SectionEntity[]> {
    const sections = await this.prisma.section.findMany({
      include: SECTION_INCLUDE,
      orderBy: [{ gradeLevel: { rank: 'asc' } }, { name: 'asc' }],
    });
    return sections.map(toEntity);
  }

  async create(dto: CreateSectionDto, actor: AuthenticatedUser): Promise<SectionEntity> {
    if (!actor.schoolId) {
      throw new ForbiddenException('A platform user cannot create sections directly');
    }

    const gradeLevel = await this.prisma.gradeLevel.findUnique({ where: { id: dto.gradeLevelId } });
    if (!gradeLevel) {
      throw new NotFoundException('Grade level not found');
    }

    try {
      // schoolId is passed explicitly even though the tenant guard would stamp it — the
      // guard's mismatch check verifies the value rather than trusting it, same as
      // StudentsService.create.
      const section = await this.prisma.section.create({
        data: { schoolId: actor.schoolId, gradeLevelId: dto.gradeLevelId, name: dto.name },
        include: SECTION_INCLUDE,
      });
      return toEntity(section);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A section with this name already exists for that grade level');
      }
      throw error;
    }
  }
}
