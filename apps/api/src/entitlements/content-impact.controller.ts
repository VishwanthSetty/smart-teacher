import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { ContentImpactService } from './content-impact.service';
import { ContentImpactQueryDto } from './dto/content-impact-query.dto';
import { ContentImpactEntity } from './entities/content-impact.entity';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/content-impact')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class ContentImpactController {
  constructor(private readonly contentImpact: ContentImpactService) {}

  @Get()
  @ApiResponse({ status: 200, type: ContentImpactEntity })
  get(@Query() query: ContentImpactQueryDto): Promise<ContentImpactEntity> {
    return this.contentImpact.get(query.gradeLevelId, query.subjectId);
  }
}
