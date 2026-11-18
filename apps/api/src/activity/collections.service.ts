import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { actorScopeOf, requireReadable } from '../common/authorization/resource-access';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityAccessPolicy } from './activity-access.policy';
import type { CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: ActivityAccessPolicy,
  ) {}

  list(actor: AuthenticatedUser) {
    return this.prisma.collection.findMany({
      where: { ownerId: actor.sub },
      include: { bookmarks: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCollectionDto, actor: AuthenticatedUser) {
    if (!actor.schoolId) throw new NotFoundException('School not found');
    const sortOrder = dto.sortOrder ?? (await this.prisma.collection.count({ where: { ownerId: actor.sub } }));
    try {
      return await this.prisma.collection.create({
        data: { schoolId: actor.schoolId, ownerId: actor.sub, name: dto.name.trim(), sortOrder },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A collection with that name already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCollectionDto, actor: AuthenticatedUser) {
    await this.findOwned(id, actor);
    try {
      return await this.prisma.collection.update({
        where: { id },
        data: { name: dto.name?.trim(), sortOrder: dto.sortOrder },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A collection with that name already exists');
      }
      throw error;
    }
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    await this.findOwned(id, actor);
    await this.prisma.collection.delete({ where: { id } });
  }

  private async findOwned(id: string, actor: AuthenticatedUser) {
    const row = await this.prisma.collection.findUnique({ where: { id } });
    return requireReadable(row, actorScopeOf(actor), this.accessPolicy, 'Collection not found');
  }
}
