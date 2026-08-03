import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { SectionEntity } from './entities/section.entity';

@ApiTags('students')
@ApiBearerAuth()
@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Get()
  @Roles(Role.SCHOOL_ADMIN, Role.TEACHER)
  @ApiResponse({ status: 200, type: [SectionEntity] })
  findAll(): Promise<SectionEntity[]> {
    return this.sectionsService.findAll();
  }

  @Post()
  @Roles(Role.SCHOOL_ADMIN)
  @ApiResponse({ status: 201, type: SectionEntity })
  @ApiResponse({ status: 404, description: 'Grade level not found.' })
  @ApiResponse({ status: 409, description: 'A section with this name already exists for that grade level.' })
  create(@Body() dto: CreateSectionDto, @CurrentUser() actor: AuthenticatedUser): Promise<SectionEntity> {
    return this.sectionsService.create(dto, actor);
  }
}
