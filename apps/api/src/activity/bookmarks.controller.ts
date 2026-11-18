import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BookmarksService } from './bookmarks.service';
import { CollectionsService } from './collections.service';
import { CreateBookmarkDto } from './dto/bookmark.dto';
import { CollectionItemDto, CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';

@ApiTags('activity')
@ApiBearerAuth()
@Controller('me')
export class BookmarksController {
  constructor(
    private readonly bookmarks: BookmarksService,
    private readonly collections: CollectionsService,
  ) {}

  @Get('bookmarks')
  @Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOkResponse({ description: 'Lists visible bookmarks owned by the current user.' })
  listBookmarks(@CurrentUser() actor: AuthenticatedUser) {
    return this.bookmarks.list(actor);
  }

  @Post('bookmarks')
  @Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOkResponse({ description: 'Saves a visible resource idempotently.' })
  createBookmark(@Body() dto: CreateBookmarkDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.bookmarks.create(dto, actor);
  }

  @Delete('bookmarks/:id')
  @Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
  @ApiOkResponse({ description: 'Removes an owned bookmark.' })
  removeBookmark(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.bookmarks.remove(id, actor);
  }

  @Get('collections')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Lists teacher-owned collections.' })
  listCollections(@CurrentUser() actor: AuthenticatedUser) {
    return this.collections.list(actor);
  }

  @Post('collections')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Creates a teacher-owned collection.' })
  createCollection(@Body() dto: CreateCollectionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.collections.create(dto, actor);
  }

  @Patch('collections/:id')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Updates an owned collection.' })
  updateCollection(
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.collections.update(id, dto, actor);
  }

  @Delete('collections/:id')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Deletes a collection and unfiles its bookmarks.' })
  removeCollection(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.collections.remove(id, actor);
  }

  @Post('collections/:id/items')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Moves an owned bookmark into a collection.' })
  addItem(
    @Param('id') id: string,
    @Body() dto: CollectionItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bookmarks.move(id, dto.bookmarkId, actor, true);
  }

  @Delete('collections/:id/items')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Moves an owned bookmark out of a collection.' })
  removeItem(
    @Param('id') id: string,
    @Body() dto: CollectionItemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.bookmarks.move(id, dto.bookmarkId, actor, false);
  }
}
