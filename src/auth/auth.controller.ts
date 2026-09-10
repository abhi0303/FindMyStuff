import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SkipTerms } from '../common/decorators/skip-terms.decorator';
import { AuthUser } from '../common/types';
import { AuthService } from './auth.service';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupDto } from './dto/signup.dto';
import {
  ChangePasswordResponse,
  LoginResponse,
  MeResponse,
  SignupResponse,
  TokenPairResponse,
} from './dto/auth-response.dto';
import { SuccessResponse } from '../common/dto/response.dto';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';

const context = (req: Request) => ({
  userAgent: req.headers['user-agent'],
  ip: req.ip,
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ auth: {} })
  @Post('signup')
  @ApiOperation({ summary: 'Create an account. Terms must be accepted here.' })
  @ApiCreatedResponse({ type: SignupResponse })
  signup(@Body() dto: SignupDto, @Req() req: Request) {
    return this.authService.signup(dto, context(req));
  }

  @Public()
  @Throttle({ auth: {} })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and receive an access + refresh token pair' })
  @ApiOkResponse({ type: LoginResponse })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, context(req));
  }

  @Public()
  @Throttle({ auth: {} })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair (rotating)' })
  @ApiOkResponse({ type: TokenPairResponse })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, context(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a single refresh token' })
  @ApiOkResponse({ type: SuccessResponse })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @SkipTerms()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  @ApiOkResponse({ type: SuccessResponse })
  logoutAll(@CurrentUser('id') userId: string) {
    return this.authService.logoutAll(userId);
  }

  @ApiBearerAuth()
  @SkipTerms()
  @Get('me')
  @ApiOperation({ summary: 'Current user, including whether new terms need accepting' })
  @ApiOkResponse({ type: MeResponse })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @ApiBearerAuth()
  @SkipTerms()
  @Post('accept-terms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept the current terms version' })
  @ApiOkResponse({ type: MeResponse })
  acceptTerms(@CurrentUser('id') userId: string, @Body() dto: AcceptTermsDto, @Req() req: Request) {
    return this.authService.acceptTerms(userId, dto, context(req));
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password and sign out every session' })
  @ApiOkResponse({ type: ChangePasswordResponse })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }
}
