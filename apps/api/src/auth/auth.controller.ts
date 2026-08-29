import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AnyRole } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from './types/authenticated-user.interface';
import { RefreshTokenPayload } from './types/refresh-token-payload.interface';
import { InvitesService } from '../invites/invites.service';
import { PasswordResetService, GENERIC_RESET_MESSAGE } from './password-reset.service';
import { PasswordResetRequested } from './entities/password-reset-requested.entity';
import { PreviewInviteQueryDto } from './dto/preview-invite-query.dto';
import { InvitePreviewEntity } from '../invites/entities/invite-preview.entity';

// @Public() is deliberately never applied at the class level here: RolesGuard reads it
// with getAllAndOverride, so a class-level @Public would leak to `logout` (whose handler
// has no metadata of its own), making session revocation unauthenticated.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly invitesService: InvitesService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Access and refresh tokens issued.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  @ApiResponse({ status: 403, description: 'Account disabled or school suspended.' })
  @ApiResponse({ status: 429, description: 'Too many failed login attempts.' })
  login(@Req() req: Request) {
    return this.authService.login(req.user as User);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'New access and refresh tokens issued; the old refresh token is revoked.' })
  @ApiResponse({ status: 401, description: 'Refresh token invalid, expired, or reused after theft detection.' })
  @ApiResponse({ status: 403, description: 'Account disabled or school suspended since the last refresh.' })
  refresh(@Req() req: Request) {
    const payload = req.user as RefreshTokenPayload & { refreshToken: string };
    return this.authService.refresh(payload, payload.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AnyRole()
  @ApiBearerAuth()
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 204, description: 'Refresh token(s) revoked server-side.' })
  async logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogoutDto) {
    await this.authService.logout(user.sub, dto.refreshToken);
  }

  @Post('set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @ApiBody({ type: SetPasswordDto })
  @ApiResponse({ status: 204, description: 'Password set; the account is now active.' })
  @ApiResponse({ status: 400, description: 'Invite token invalid, already used, or password fails policy.' })
  @ApiResponse({ status: 403, description: 'The account\'s school is suspended.' })
  @ApiResponse({ status: 410, description: 'Invite token expired; ask an administrator to resend it.' })
  async setPassword(@Body() dto: SetPasswordDto) {
    await this.invitesService.redeem(dto.token, dto.password);
  }

  @Get('invite')
  @Public()
  @ApiResponse({ status: 200, type: InvitePreviewEntity })
  @ApiResponse({ status: 400, description: 'Invite token invalid or already used.' })
  @ApiResponse({ status: 403, description: 'The account\'s school is suspended.' })
  @ApiResponse({ status: 410, description: 'Invite token expired.' })
  previewInvite(@Query() query: PreviewInviteQueryDto): Promise<InvitePreviewEntity> {
    return this.invitesService.preview(query.token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    type: PasswordResetRequested,
    description: 'Always returned, whether or not the account exists.',
  })
  @ApiResponse({ status: 429, description: 'Too many reset requests for this email or IP.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<PasswordResetRequested> {
    await this.passwordResetService.requestReset(dto.email, req.ip ?? '', dto.schoolSlug);
    return { message: GENERIC_RESET_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 204, description: 'Password changed; all sessions revoked.' })
  @ApiResponse({ status: 400, description: 'Token invalid or already used, or password fails policy.' })
  @ApiResponse({ status: 403, description: 'The account is disabled or its school is suspended.' })
  @ApiResponse({ status: 410, description: 'Reset link expired; request a new one.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(dto.token, dto.password);
  }
}
