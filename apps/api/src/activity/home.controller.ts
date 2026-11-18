import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { HomeService } from './home.service';

@ApiTags('home')
@ApiBearerAuth()
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('student')
  @Roles(Role.STUDENT)
  @ApiOkResponse({ description: 'Returns the student home aggregate.' })
  student(@CurrentUser() actor: AuthenticatedUser) {
    return this.homeService.student(actor);
  }

  @Get('teacher')
  @Roles(Role.TEACHER)
  @ApiOkResponse({ description: 'Returns the teacher home aggregate.' })
  teacher(@CurrentUser() actor: AuthenticatedUser) {
    return this.homeService.teacher(actor);
  }
}
