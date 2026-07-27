import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { ListSchoolsQueryDto } from './dto/list-schools-query.dto';
import { SchoolEntity } from './entities/school.entity';
import { PaginatedSchoolsEntity } from './entities/paginated-schools.entity';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/schools')
@Roles(Role.SUPER_ADMIN)
@BypassTenantScope()
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Post()
  create(@Body() dto: CreateSchoolDto): Promise<SchoolEntity> {
    return this.schoolsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListSchoolsQueryDto): Promise<PaginatedSchoolsEntity> {
    return this.schoolsService.findAll(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto): Promise<SchoolEntity> {
    return this.schoolsService.update(id, dto);
  }
}
