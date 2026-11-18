import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles, AnyRole } from '../common/decorators/roles.decorator';
import { BypassTenantScope } from '../tenancy/decorators/bypass-tenant-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { InvitesService } from '../invites/invites.service';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';
import { MeEntity } from './entities/me.entity';
import { SwitchCurrentEnrollmentDto } from './dto/switch-current-enrollment.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @AnyRole()
  @ApiResponse({ status: 200, type: MeEntity })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeEntity> {
    return this.usersService.getProfile(user);
  }

  @Put('me/current-enrollment')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Switch the class a student is currently in' })
  @ApiResponse({ status: 200, type: MeEntity })
  @ApiResponse({ status: 404, description: 'Not one of the caller\'s active enrollments.' })
  switchCurrentEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchCurrentEnrollmentDto,
  ): Promise<MeEntity> {
    return this.usersService.switchCurrentEnrollment(user, dto.enrollmentId);
  }

  // Declared after 'me' so the literal segment isn't swallowed by this param route.
  //
  // @BypassTenantScope() is required here, not optional: SUPER_ADMIN has a null
  // schoolId, and without a bypass the tenant guard throws MissingTenantContextError
  // (-> 500) the moment it tries to scope this query. The bypass only actually engages
  // for SUPER_ADMIN (TenantContextInterceptor checks the role too); every other caller
  // stays scoped to their own school as normal. UsersAccessPolicy still restricts a
  // non-SCHOOL_ADMIN caller to reading only their own record, so the bypass does not by
  // itself widen who can see what — it only stops SUPER_ADMIN's own lookup from 500ing.
  @Get(':id')
  @AnyRole()
  @BypassTenantScope()
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser): Promise<UserEntity> {
    return this.usersService.findOneVisibleTo(id, actor);
  }

  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SUPER_ADMIN, Role.SCHOOL_ADMIN)
  @BypassTenantScope()
  @ApiResponse({ status: 204, description: 'A new invite is minted and emailed; the previous link is invalidated.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'User has already activated their account.' })
  resendInvite(@Param('id') id: string): Promise<void> {
    return this.invitesService.resendForUser(id);
  }
}
