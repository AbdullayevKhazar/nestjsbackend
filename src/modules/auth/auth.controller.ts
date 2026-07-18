import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from '../types/jwt-payload.type';
import { UserService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
    private readonly userService: UserService,
  ) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.cookieService.setAccessTokenCookie(res, result.accessToken);
    this.cookieService.setRefreshTokenCookie(res, result.refreshToken);
    return { user: result.user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      this.cookieService.clearAuthCookies(res);
      throw new UnauthorizedException('Refresh token not found');
    }

    try {
      const result = await this.authService.refresh(refreshToken);
      this.cookieService.setAccessTokenCookie(res, result.accessToken);
      this.cookieService.setRefreshTokenCookie(res, result.refreshToken);
      return { message: 'Token refreshed successfully' };
    } catch (error) {
      this.cookieService.clearAuthCookies(res);
      throw error;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload) {
    const fullUser = await this.userService.findById(user.sub);
    return {
      id: fullUser?.id,
      fullName: fullUser?.fullName,
      email: fullUser?.email,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.sub);
    this.cookieService.clearAuthCookies(res);
    return { message: 'Logged out successfully' };
  }
}
