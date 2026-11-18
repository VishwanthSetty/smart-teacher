import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { LibrarySearchQueryDto } from './dto/library-search-query.dto';
import { LibrarySearchService } from './library-search.service';

@ApiTags('library')
@ApiBearerAuth()
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
@Controller('library')
export class LibrarySearchController {
  constructor(private readonly searchService: LibrarySearchService) {}

  @Get('search')
  @ApiOkResponse({ description: 'Searches only content visible to the current actor.' })
  search(@Query() query: LibrarySearchQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.searchService.search(query, actor);
  }
}
