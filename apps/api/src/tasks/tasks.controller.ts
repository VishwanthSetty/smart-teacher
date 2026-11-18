import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { ClassProgressQueryDto, ListTasksQueryDto, TaskProgressQueryDto } from './dto/task-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskProgressService } from './task-progress.service';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Roles(Role.TEACHER)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly progress: TaskProgressService,
  ) {}

  @Post()
  @ApiOkResponse({ description: 'Creates and fans out a task.' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.create(dto, actor);
  }

  @Get()
  @ApiOkResponse({ description: 'Lists tasks created by the current teacher.' })
  list(@Query() query: ListTasksQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.list(query, actor);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Returns a task and recipient counts.' })
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.findTeacherTask(id, actor);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Updates task presentation fields.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.update(id, dto, actor);
  }

  @Post(':id/cancel')
  @ApiOkResponse({ description: 'Cancels a task without deleting its record.' })
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.cancel(id, actor);
  }

  @Get(':id/progress')
  @ApiOkResponse({ description: 'Returns per-student task progress.' })
  taskProgress(
    @Param('id') id: string,
    @Query() query: TaskProgressQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.progress.forTask(id, query, actor);
  }

  @Get(':id/students/:studentId')
  @ApiOkResponse({ description: 'Returns a scoped student activity row for this task.' })
  studentProgress(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tasks.studentResourceActivity(id, studentId, actor);
  }

  @Post(':id/remind')
  @ApiOkResponse({ description: 'Reminds pending recipients once per UTC day.' })
  remind(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.remind(id, actor);
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@Roles(Role.TEACHER)
@Controller('teacher')
export class TeacherProgressController {
  constructor(private readonly progress: TaskProgressService) {}

  @Get('class-progress')
  @ApiOkResponse({ description: 'Returns task completion rollups within teacher class scope.' })
  classProgress(
    @Query() query: ClassProgressQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.progress.classRollup(query, actor);
  }
}
