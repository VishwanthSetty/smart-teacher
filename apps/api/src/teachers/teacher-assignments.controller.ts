import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { TeacherAssignmentsService } from './teacher-assignments.service';
import { CreateTeacherAssignmentDto } from './dto/create-teacher-assignment.dto';
import { ListTeacherAssignmentsQueryDto } from './dto/list-teacher-assignments-query.dto';
import { TeacherAssignmentEntity } from './entities/teacher-assignment.entity';

// No class-level @Roles: GET is wider (SCHOOL_ADMIN + TEACHER) than the writes
// (SCHOOL_ADMIN only), and getAllAndOverride means a method decorator replaces rather
// than widens the class list — a class-level default here would be misleading.
@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teacher-assignments')
export class TeacherAssignmentsController {
  constructor(private readonly teacherAssignmentsService: TeacherAssignmentsService) {}

  @Post()
  @Roles(Role.SCHOOL_ADMIN)
  @ApiResponse({ status: 201, type: TeacherAssignmentEntity })
  @ApiResponse({ status: 400, description: 'Subject has been retired.' })
  @ApiResponse({ status: 404, description: 'Teacher, subject, or section not found.' })
  @ApiResponse({ status: 409, description: 'That teacher, subject and section combination already exists.' })
  create(
    @Body() dto: CreateTeacherAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentEntity> {
    return this.teacherAssignmentsService.create(dto, actor);
  }

  @Get()
  @Roles(Role.SCHOOL_ADMIN, Role.TEACHER)
  @ApiResponse({ status: 200, type: [TeacherAssignmentEntity] })
  findAll(@Query() query: ListTeacherAssignmentsQueryDto): Promise<TeacherAssignmentEntity[]> {
    return this.teacherAssignmentsService.findAll(query);
  }

  @Delete(':id')
  @Roles(Role.SCHOOL_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Assignment removed.' })
  @ApiResponse({ status: 404, description: 'Assignment not found.' })
  remove(@Param('id') id: string): Promise<void> {
    return this.teacherAssignmentsService.remove(id);
  }
}
