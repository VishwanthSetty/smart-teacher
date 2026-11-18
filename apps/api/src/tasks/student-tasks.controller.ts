import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StudentTasksQueryDto } from './dto/task-query.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller('me/tasks')
export class StudentTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOkResponse({ description: 'Lists tasks assigned to the current student.' })
  list(@Query() query: StudentTasksQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.studentTasks(query, actor);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Returns one assigned task and its resource.' })
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.tasks.findStudentTask(id, actor);
  }
}
