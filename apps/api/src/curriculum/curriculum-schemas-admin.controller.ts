import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurriculumSchemasService } from './curriculum-schemas.service';
import { CloneCurriculumSchemaDto } from './dto/clone-curriculum-schema.dto';
import { CreateCurriculumSchemaDto } from './dto/create-curriculum-schema.dto';
import { UpdateCurriculumSchemaDto } from './dto/update-curriculum-schema.dto';
import { CurriculumSchemaEntity } from './entities/curriculum-schema.entity';

// The level vocabularies curricula are built from — SUPER_ADMIN only, like the rest of
// the platform taxonomy.
//
// No @BypassTenantScope(): CurriculumSchema and CurriculumLevel are platform-global and
// carry no schoolId, so nothing here enters the tenant guard.
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/curriculum-schemas')
@Roles(Role.SUPER_ADMIN)
export class CurriculumSchemasAdminController {
  constructor(private readonly schemas: CurriculumSchemasService) {}

  @Get()
  @ApiResponse({ status: 200, type: [CurriculumSchemaEntity] })
  findAll(): Promise<CurriculumSchemaEntity[]> {
    return this.schemas.findAll();
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: CurriculumSchemaEntity })
  @ApiResponse({ status: 404, description: 'Curriculum schema not found.' })
  findOne(@Param('id') id: string): Promise<CurriculumSchemaEntity> {
    return this.schemas.findOne(id);
  }

  @Post()
  @ApiResponse({ status: 201, type: CurriculumSchemaEntity })
  @ApiResponse({ status: 400, description: 'Levels are not numbered from 1 with no gaps.' })
  @ApiResponse({ status: 409, description: 'A schema with this code already exists.' })
  create(@Body() dto: CreateCurriculumSchemaDto): Promise<CurriculumSchemaEntity> {
    return this.schemas.create(dto);
  }

  @Post(':id/clone')
  @ApiResponse({ status: 201, type: CurriculumSchemaEntity })
  @ApiResponse({ status: 404, description: 'Curriculum schema not found.' })
  @ApiResponse({ status: 409, description: 'A schema with this code already exists.' })
  clone(@Param('id') id: string, @Body() dto: CloneCurriculumSchemaDto): Promise<CurriculumSchemaEntity> {
    return this.schemas.clone(id, dto);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: CurriculumSchemaEntity })
  @ApiResponse({ status: 404, description: 'Curriculum schema not found.' })
  @ApiResponse({
    status: 409,
    description: 'Curricula on this schema still have nodes at a level being removed.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateCurriculumSchemaDto): Promise<CurriculumSchemaEntity> {
    return this.schemas.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'The schema is deleted.' })
  @ApiResponse({ status: 404, description: 'Curriculum schema not found.' })
  @ApiResponse({ status: 409, description: 'The schema is still used by one or more curricula.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.schemas.remove(id);
  }
}
