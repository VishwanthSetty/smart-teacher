import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { CurriculaService } from './curricula.service';
import { ContentNodesService } from './content-nodes.service';
import { ContentTreeService } from './content-tree.service';
import { CreateContentNodeDto } from './dto/create-content-node.dto';
import { CreateCurriculumDto } from './dto/create-curriculum.dto';
import { ListCurriculaQueryDto } from './dto/list-curricula-query.dto';
import { UpdateCurriculumDto } from './dto/update-curriculum.dto';
import { ContentNodeEntity } from './entities/content-node.entity';
import { ContentTreeEntity } from './entities/content-tree.entity';
import { CurriculumDetailEntity } from './entities/curriculum.entity';
import { PaginatedCurriculaEntity } from './entities/paginated-curricula.entity';

// Curriculum authoring — SUPER_ADMIN only. A curriculum is platform content, authored
// once for every school, exactly like the grade level and subject taxonomy it keys off.
//
// @BypassTenantScope() is required, not optional, for the same reason
// GradeLevelsController needs it: Curriculum and ContentNode are platform-global, but the
// detail read reports how many schools hold a grant and the delete guard refuses while
// any does — both count SchoolContentEntitlement, which is in TENANT_SCOPED_MODELS, and
// SUPER_ADMIN has a null schoolId. Without the bypass those queries throw
// MissingTenantContextError (-> 500). The bypass only engages for SUPER_ADMIN
// (TenantContextInterceptor checks the role too).
//
// Those counts are rooted at SchoolContentEntitlement rather than reached through
// Curriculum.entitlements on purpose: a relation traversal from a Curriculum root would
// enter the tenant guard's nested walker and answer "grants in this one tenant", which is
// the wrong question for a platform-wide count.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/curricula')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class CurriculaAdminController {
  constructor(
    private readonly curricula: CurriculaService,
    private readonly nodes: ContentNodesService,
    private readonly tree: ContentTreeService,
  ) {}

  @Get()
  @ApiResponse({ status: 200, type: PaginatedCurriculaEntity })
  findAll(@Query() query: ListCurriculaQueryDto): Promise<PaginatedCurriculaEntity> {
    return this.curricula.findAll(query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: CurriculumDetailEntity })
  @ApiResponse({ status: 404, description: 'Curriculum not found.' })
  findOne(@Param('id') id: string): Promise<CurriculumDetailEntity> {
    return this.curricula.findOne(id);
  }

  // The builder view: every node and every video, whatever the publication state.
  @Get(':id/tree')
  @ApiResponse({ status: 200, type: ContentTreeEntity })
  @ApiResponse({ status: 404, description: 'Curriculum not found.' })
  findTree(@Param('id') id: string): Promise<ContentTreeEntity> {
    return this.tree.findForAdmin(id);
  }

  @Post()
  @ApiResponse({ status: 201, type: CurriculumDetailEntity })
  @ApiResponse({ status: 404, description: 'Grade level, subject, or schema not found.' })
  @ApiResponse({
    status: 409,
    description: 'A curriculum already exists for that pair, or the subject is retired.',
  })
  create(@Body() dto: CreateCurriculumDto): Promise<CurriculumDetailEntity> {
    return this.curricula.create(dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: CurriculumDetailEntity })
  @ApiResponse({ status: 404, description: 'Curriculum or schema not found.' })
  @ApiResponse({
    status: 409,
    description: 'The existing tree is deeper than the new schema allows.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateCurriculumDto): Promise<CurriculumDetailEntity> {
    return this.curricula.update(id, dto);
  }

  // POST, but 200 not 201: publishing transitions an existing row rather than creating
  // anything, so the default POST status would misdescribe it.
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: CurriculumDetailEntity })
  @ApiResponse({ status: 404, description: 'Curriculum not found.' })
  @ApiResponse({ status: 409, description: 'The curriculum is empty or archived.' })
  publish(@Param('id') id: string): Promise<CurriculumDetailEntity> {
    return this.curricula.publish(id);
  }

  // Withdraws the tree from every entitled school immediately.
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: CurriculumDetailEntity })
  @ApiResponse({ status: 404, description: 'Curriculum not found.' })
  @ApiResponse({ status: 409, description: 'The curriculum is not published.' })
  unpublish(@Param('id') id: string): Promise<CurriculumDetailEntity> {
    return this.curricula.unpublish(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The curriculum and its tree are deleted.' })
  @ApiResponse({ status: 404, description: 'Curriculum not found.' })
  @ApiResponse({ status: 409, description: 'Entitlements or videos still reference it.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.curricula.remove(id);
  }

  // Nested under the curriculum because a node cannot exist without one, and the
  // curriculum is what supplies the schema the new node's depth is checked against.
  @Post(':id/nodes')
  @ApiResponse({ status: 201, type: ContentNodeEntity })
  @ApiResponse({ status: 404, description: 'Curriculum or parent node not found.' })
  @ApiResponse({
    status: 409,
    description: "The schema has no level at that depth, or the code is taken.",
  })
  createNode(@Param('id') id: string, @Body() dto: CreateContentNodeDto): Promise<ContentNodeEntity> {
    return this.nodes.create(id, dto);
  }
}
