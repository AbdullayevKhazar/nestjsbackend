import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import type { JwtPayload } from '../../types/jwt-payload.type';
import { UserService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { CookieService } from '../cookie.service';
import { WebAuthnService } from './webauthn.service';
import { LoginOptionsDto } from './dto/login-options.dto';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

@Controller('auth/webauthn')
export class WebAuthnController {
  constructor(
    private readonly webAuthnService: WebAuthnService,
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
    private readonly userService: UserService,
  ) {}

  @Post('register/options')
  @UseGuards(JwtAuthGuard)
  async registerOptions(@CurrentUser() userPayload: JwtPayload) {
    const user = await this.userService.findById(userPayload.sub);
    if (!user) {
      return { data: null };
    }
    const options =
      await this.webAuthnService.generateRegistrationOptions(user);
    return { data: options };
  }

  @Post('register/verify')
  @UseGuards(JwtAuthGuard)
  async registerVerify(
    @CurrentUser() userPayload: JwtPayload,
    @Body() body: RegistrationResponseJSON,
  ) {
    const user = await this.userService.findById(userPayload.sub);

    if (!user) {
      return { data: null };
    }

    const passkey = await this.webAuthnService.verifyRegistration(user, body);

    return {
      data: {
        id: passkey._id,
        credentialId: passkey.credentialId,
      },
    };
  }

  @Post('login/options')
  async loginOptions(@Body() dto: LoginOptionsDto) {
    const options = await this.webAuthnService.generateAuthenticationOptions(
      dto.email,
    );
    return { data: options };
  }

  @Post('login/verify')
  async loginVerify(
    @Body() body: AuthenticationResponseJSON,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { user } = await this.webAuthnService.verifyAuthentication(body);

      const session = await this.authService.createSession(user);

      this.cookieService.setAccessTokenCookie(res, session.accessToken);
      this.cookieService.setRefreshTokenCookie(res, session.refreshToken);

      return {
        data: {
          user: session.user,
        },
      };
    } catch (err: any) {
      console.error('[WebAuthn Login Verify Error]', err?.message ?? err);
      throw err;
    }
  }
  @Get('passkeys')
  @UseGuards(JwtAuthGuard)
  async listPasskeys(@CurrentUser() userPayload: JwtPayload) {
    const passkeys = await this.webAuthnService.findByUser(userPayload.sub);
    return {
      data: passkeys.map((pk) => ({
        id: pk._id,
        credentialId: pk.credentialId,
        counter: pk.counter,
        transports: pk.transports,
        deviceType: pk.deviceType,
        backedUp: pk.backedUp,
        createdAt: pk.createdAt,
      })),
    };
  }

  @Delete('passkeys/:id')
  @UseGuards(JwtAuthGuard)
  async deletePasskey(
    @CurrentUser() userPayload: JwtPayload,
    @Param('id') passkeyId: string,
  ) {
    await this.webAuthnService.deletePasskey(userPayload.sub, passkeyId);
    return { data: { deleted: true } };
  }
}
