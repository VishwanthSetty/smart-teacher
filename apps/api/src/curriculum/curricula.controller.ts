import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { ContentTreeService } from './content-tree.service';
import { ContentTreeEntity } from './entities/content-tree.entity';
import { CurriculumEntity } from './entities/curriculum.entity';

// The school-facing library structure. Browsing entitled content is available to
// SCHOOL_ADMIN, TEACHER and STUDENT, matching VideosController. SUPER_ADMIN remains
// excluded because platform authors work through /admin/curricula instead.
//
// No @BypassTenantScope(): both roles carry a real schoolId, and the tenant guard scoping
// SchoolContentEntitlement to it is exactly what makes the read safe.
@ApiTags('curricula')
@ApiBearerAuth()
@Controller('curricula')
@Roles(Role.SCHOOL_ADMIN, Role.TEACHER, Role.STUDENT)
export class CurriculaController {
  constructor(private readonly tree: ContentTreeService) {}

  @Get()
  @ApiResponse({ status: 200, type: [CurriculumEntity] })
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<CurriculumEntity[]> {
    return this.tree.findAllVisibleTo(actor);
  }

  @Get(':id/tree')
  @ApiResponse({ status: 200, type: ContentTreeEntity })
  @ApiResponse({
    status: 404,
    description: 'No such curriculum, the school holds no entitlement for it, or it is unpublished.',
  })
  findTree(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<ContentTreeEntity> {
    return this.tree.findVisibleTo(id, actor);
  }
}
