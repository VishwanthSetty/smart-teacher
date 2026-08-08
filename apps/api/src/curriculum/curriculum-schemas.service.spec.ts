import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurriculumSchemasService } from './curriculum-schemas.service';

const LEVELS = [
  { id: 'l1', depth: 1, name: 'Chapter', canHoldContent: false },
  { id: 'l2', depth: 2, name: 'Topic', canHoldContent: true },
];

const SCHEMA_ROW = {
  id: 'schema-1',
  name: 'Chapter / Topic',
  code: 'chapter-topic',
  description: null,
  levels: LEVELS,
  _count: { curricula: 0 },
};

describe('CurriculumSchemasService', () => {
  let service: CurriculumSchemasService;
  let prisma: {
    curriculumSchema: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    curriculumLevel: { deleteMany: jest.Mock; createMany: jest.Mock };
    contentNode: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      curriculumSchema: {
        findMany: jest.fn().mockResolvedValue([SCHEMA_ROW]),
        findUnique: jest.fn().mockResolvedValue(SCHEMA_ROW),
        create: jest.fn().mockResolvedValue(SCHEMA_ROW),
        update: jest.fn().mockResolvedValue(SCHEMA_ROW),
        delete: jest.fn().mockResolvedValue(SCHEMA_ROW),
      },
      curriculumLevel: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      contentNode: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CurriculumSchemasService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CurriculumSchemasService);
  });

  it('reports how many curricula bind a schema, so an operator sees it is in use', async () => {
    prisma.curriculumSchema.findMany.mockResolvedValue([
      { ...SCHEMA_ROW, _count: { curricula: 4 } },
    ]);

    await expect(service.findAll()).resolves.toEqual([
      expect.objectContaining({ curriculumCount: 4 }),
    ]);
  });

  describe('create', () => {
    const dto = {
      name: 'Chapter / Topic',
      code: 'chapter-topic',
      levels: [
        { depth: 1, name: 'Chapter', canHoldContent: false },
        { depth: 2, name: 'Topic', canHoldContent: true },
      ],
    };

    it('creates the schema and its levels in one write', async () => {
      await service.create(dto);

      expect(prisma.curriculumSchema.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ levels: { create: dto.levels } }),
        }),
      );
    });

    // Levels 1 and 3 describe a tree with an unreachable floor: nothing could ever sit at
    // depth 3, because creating it needs a depth-2 parent the vocabulary forbids.
    it('400s on a gap in the level numbering', async () => {
      await expect(
        service.create({
          ...dto,
          levels: [
            { depth: 1, name: 'Chapter', canHoldContent: false },
            { depth: 3, name: 'Topic', canHoldContent: true },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.curriculumSchema.create).not.toHaveBeenCalled();
    });

    it('400s when the levels do not start at 1', async () => {
      await expect(
        service.create({ ...dto, levels: [{ depth: 2, name: 'Topic', canHoldContent: true }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400s on duplicate depths', async () => {
      await expect(
        service.create({
          ...dto,
          levels: [
            { depth: 1, name: 'Chapter', canHoldContent: false },
            { depth: 1, name: 'Unit', canHoldContent: false },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('409s on a duplicate code', async () => {
      prisma.curriculumSchema.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['code'] },
        }),
      );

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('clone', () => {
    it('copies the source levels under a new name and code', async () => {
      prisma.curriculumSchema.findUnique.mockResolvedValue({
        description: 'Standard',
        levels: [{ depth: 1, name: 'Chapter', canHoldContent: false }],
      });

      await service.clone('schema-1', { name: 'Copy', code: 'copy' });

      expect(prisma.curriculumSchema.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Copy',
            code: 'copy',
            levels: { create: [{ depth: 1, name: 'Chapter', canHoldContent: false }] },
          }),
        }),
      );
    });

    it('404s on a source schema that does not exist', async () => {
      prisma.curriculumSchema.findUnique.mockResolvedValue(null);

      await expect(service.clone('nope', { name: 'Copy', code: 'copy' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('renames without touching the levels when none are supplied', async () => {
      await service.update('schema-1', { name: 'Renamed' });

      expect(prisma.curriculumLevel.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces the level set when levels are supplied', async () => {
      await service.update('schema-1', {
        levels: [{ depth: 1, name: 'Unit', canHoldContent: true }],
      });

      expect(prisma.curriculumLevel.deleteMany).toHaveBeenCalledWith({
        where: { schemaId: 'schema-1' },
      });
      expect(prisma.curriculumLevel.createMany).toHaveBeenCalledWith({
        data: [{ depth: 1, name: 'Unit', canHoldContent: true, schemaId: 'schema-1' }],
      });
    });

    // Dropping an occupied level would leave live subtrees below a vocabulary that no
    // longer names them, and every tree read would have to invent a label.
    it('409s when removing a level that curricula still have nodes at', async () => {
      prisma.contentNode.findMany.mockResolvedValue([{ depth: 1 }, { depth: 2 }]);

      await expect(
        service.update('schema-1', { levels: [{ depth: 1, name: 'Chapter', canHoldContent: true }] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.curriculumLevel.deleteMany).not.toHaveBeenCalled();
    });

    it('allows a level replacement that keeps every occupied depth', async () => {
      prisma.contentNode.findMany.mockResolvedValue([{ depth: 1 }]);

      await expect(
        service.update('schema-1', {
          levels: [
            { depth: 1, name: 'Chapter', canHoldContent: false },
            { depth: 2, name: 'Section', canHoldContent: true },
          ],
        }),
      ).resolves.toBeDefined();
    });

    it('404s on a schema that does not exist', async () => {
      prisma.curriculumSchema.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a schema nothing binds', async () => {
      prisma.curriculumSchema.findUnique.mockResolvedValue({ _count: { curricula: 0 } });

      await expect(service.remove('schema-1')).resolves.toBeUndefined();
      expect(prisma.curriculumSchema.delete).toHaveBeenCalledWith({ where: { id: 'schema-1' } });
    });

    // The FK is Restrict, so this would fail at the database anyway — the pre-check turns
    // a raw constraint violation into a message an operator can act on.
    it('409s while curricula still bind it', async () => {
      prisma.curriculumSchema.findUnique.mockResolvedValue({ _count: { curricula: 2 } });

      await expect(service.remove('schema-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.curriculumSchema.delete).not.toHaveBeenCalled();
    });

    it('404s on a schema that does not exist', async () => {
      prisma.curriculumSchema.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
