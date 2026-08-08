import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloneCurriculumSchemaDto } from './dto/clone-curriculum-schema.dto';
import { CreateCurriculumSchemaDto, CurriculumLevelDto } from './dto/create-curriculum-schema.dto';
import { UpdateCurriculumSchemaDto } from './dto/update-curriculum-schema.dto';
import { CurriculumSchemaEntity } from './entities/curriculum-schema.entity';

const SCHEMA_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  levels: {
    select: { id: true, depth: true, name: true, canHoldContent: true },
    orderBy: { depth: 'asc' },
  },
  _count: { select: { curricula: true } },
} as const satisfies Prisma.CurriculumSchemaSelect;

type SchemaRow = Prisma.CurriculumSchemaGetPayload<{ select: typeof SCHEMA_SELECT }>;

function toEntity(row: SchemaRow): CurriculumSchemaEntity {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    levels: row.levels,
    curriculumCount: row._count.curricula,
  };
}

/**
 * The level vocabularies a curriculum's tree is built from — "Chapter -> Topic",
 * "Unit -> Experiment -> Step". SUPER_ADMIN only.
 *
 * These are what make the hierarchy configurable rather than hard-coded: a schema is
 * authored once and bound by many curricula, so per-grade and per-subject variation does
 * not become one bespoke config blob per curriculum.
 */
@Injectable()
export class CurriculumSchemasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<CurriculumSchemaEntity[]> {
    const rows = await this.prisma.curriculumSchema.findMany({
      select: SCHEMA_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toEntity);
  }

  async findOne(id: string): Promise<CurriculumSchemaEntity> {
    const row = await this.prisma.curriculumSchema.findUnique({ where: { id }, select: SCHEMA_SELECT });
    if (row === null) {
      throw new NotFoundException('Curriculum schema not found');
    }
    return toEntity(row);
  }

  async create(dto: CreateCurriculumSchemaDto): Promise<CurriculumSchemaEntity> {
    assertContiguousDepths(dto.levels);

    try {
      const created = await this.prisma.curriculumSchema.create({
        data: {
          name: dto.name,
          code: dto.code,
          description: dto.description,
          levels: { create: dto.levels },
        },
        select: SCHEMA_SELECT,
      });
      return toEntity(created);
    } catch (error) {
      throw translateConflict(error);
    }
  }

  async clone(id: string, dto: CloneCurriculumSchemaDto): Promise<CurriculumSchemaEntity> {
    const source = await this.prisma.curriculumSchema.findUnique({
      where: { id },
      select: { description: true, levels: { select: { depth: true, name: true, canHoldContent: true } } },
    });
    if (source === null) {
      throw new NotFoundException('Curriculum schema not found');
    }

    try {
      const created = await this.prisma.curriculumSchema.create({
        data: {
          name: dto.name,
          code: dto.code,
          description: source.description,
          levels: { create: source.levels },
        },
        select: SCHEMA_SELECT,
      });
      return toEntity(created);
    } catch (error) {
      throw translateConflict(error);
    }
  }

  /**
   * Renames a schema and optionally replaces its whole level set.
   *
   * Replacing levels is guarded: a depth may only disappear if no curriculum on this
   * schema has a node at it. Without that check an edit would leave live subtrees sitting
   * below a level that no longer names them, and every tree read would have to invent a
   * label for them.
   */
  async update(id: string, dto: UpdateCurriculumSchemaDto): Promise<CurriculumSchemaEntity> {
    const existing = await this.prisma.curriculumSchema.findUnique({
      where: { id },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException('Curriculum schema not found');
    }

    if (dto.levels === undefined) {
      const updated = await this.prisma.curriculumSchema.update({
        where: { id },
        data: { name: dto.name, description: dto.description },
        select: SCHEMA_SELECT,
      });
      return toEntity(updated);
    }

    assertContiguousDepths(dto.levels);

    const keptDepths = new Set(dto.levels.map((level) => level.depth));
    const occupied = await this.prisma.contentNode.findMany({
      where: { curriculum: { schemaId: id } },
      select: { depth: true },
      distinct: ['depth'],
    });
    const strandedDepth = occupied.map((node) => node.depth).find((depth) => !keptDepths.has(depth));
    if (strandedDepth !== undefined) {
      throw new ConflictException(
        `Curricula on this schema still have nodes at level ${strandedDepth}`,
      );
    }

    // Delete-then-recreate rather than a per-level diff: levels carry no foreign keys of
    // their own (a node references a depth, not a level row), so identity is not worth
    // preserving, and one replace is easier to reason about than a three-way merge.
    const [, , updated] = await this.prisma.$transaction([
      this.prisma.curriculumLevel.deleteMany({ where: { schemaId: id } }),
      this.prisma.curriculumLevel.createMany({
        data: dto.levels.map((level) => ({ ...level, schemaId: id })),
      }),
      this.prisma.curriculumSchema.update({
        where: { id },
        data: { name: dto.name, description: dto.description },
        select: SCHEMA_SELECT,
      }),
    ]);

    return toEntity(updated);
  }

  async remove(id: string): Promise<void> {
    const schema = await this.prisma.curriculumSchema.findUnique({
      where: { id },
      select: { _count: { select: { curricula: true } } },
    });
    if (schema === null) {
      throw new NotFoundException('Curriculum schema not found');
    }
    // The FK is onDelete: Restrict, so this would fail at the database anyway — checking
    // here turns a raw constraint violation into a message an operator can act on.
    if (schema._count.curricula > 0) {
      throw new ConflictException('This schema is still used by one or more curricula');
    }

    await this.prisma.curriculumSchema.delete({ where: { id } });
  }
}

/**
 * Levels must run 1..N with no gaps.
 *
 * A schema whose levels are 1 and 3 describes a tree with an unreachable floor: nothing
 * could ever sit at depth 3, because creating it requires a parent at depth 2 that the
 * vocabulary forbids.
 */
function assertContiguousDepths(levels: readonly CurriculumLevelDto[]): void {
  const depths = [...new Set(levels.map((level) => level.depth))].sort((a, b) => a - b);
  if (depths.length !== levels.length) {
    throw new BadRequestException('Levels must have distinct depths');
  }
  const isContiguous = depths.every((depth, index) => depth === index + 1);
  if (!isContiguous) {
    throw new BadRequestException('Levels must be numbered from 1 with no gaps');
  }
}

function translateConflict(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const field = Array.isArray(target) ? String(target[0]) : null;
    // schemaId_name is the per-schema level-name uniqueness; anything else on this model
    // is the schema code.
    if (field === 'schemaId') {
      return new ConflictException('Two levels in this schema share a name');
    }
    return new ConflictException('A curriculum schema with this code already exists');
  }
  return error;
}
