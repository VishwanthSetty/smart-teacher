import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ContentNodesService } from './content-nodes.service';
import { MoveContentNodeDto } from './dto/move-content-node.dto';
import { UpdateContentNodeDto } from './dto/update-content-node.dto';
import { ContentNodeEntity } from './entities/content-node.entity';

// Edits to an existing node, addressed by node id rather than nested under the curriculum:
// a node id is globally unique and the service resolves its curriculum itself, so a
// client dragging a row does not have to carry the curriculum id alongside it.
//
// Creation lives on CurriculaAdminController instead — a node cannot exist without a
// curriculum, so that one genuinely needs the parent in the path.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/content-nodes')
@Roles(Role.SUPER_ADMIN)
export class ContentNodesAdminController {
  constructor(private readonly nodes: ContentNodesService) {}

  @Patch(':id')
  @ApiResponse({ status: 200, type: ContentNodeEntity })
  @ApiResponse({ status: 404, description: 'Content node not found.' })
  @ApiResponse({ status: 409, description: 'The code is taken, or the curriculum is archived.' })
  update(@Param('id') id: string, @Body() dto: UpdateContentNodeDto): Promise<ContentNodeEntity> {
    return this.nodes.update(id, dto);
  }

  // Reparent and reorder in one call: they are the same gesture in the builder, and
  // splitting them would let a UI leave the tree half-moved between two requests.
  // POST, but 200 not 201: a move relocates an existing node rather than creating one.
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, type: ContentNodeEntity })
  @ApiResponse({ status: 404, description: 'Content node or destination parent not found.' })
  @ApiResponse({
    status: 409,
    description:
      'The move would create a cycle, exceed the schema depth, or strand videos at a level that cannot hold them.',
  })
  move(@Param('id') id: string, @Body() dto: MoveContentNodeDto): Promise<ContentNodeEntity> {
    return this.nodes.move(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The node and its descendants are deleted.' })
  @ApiResponse({ status: 404, description: 'Content node not found.' })
  @ApiResponse({ status: 409, description: 'The branch still holds videos.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.nodes.remove(id);
  }
}
