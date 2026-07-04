import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { UserService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../types/jwt-payload.type';
import { UserDocument } from '../users/schemas/user.schema';
import { TokenPair } from '../types/token-pair.type';
import type { ConfigType } from '@nestjs/config';
import { jwtConfig as jwtConfiguration } from '../../config';
import type { StringValue } from 'ms';

interface TokenPairWithJti extends TokenPair {
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,

    @Inject(jwtConfiguration.KEY)
    private readonly jwtConfig: ConfigType<typeof jwtConfiguration>,
  ) {}

  private async generateTokens(user: UserDocument): Promise<TokenPairWithJti> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const jti = uuidv4();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(
        { ...payload, jti },
        {
          secret: this.jwtConfig.refreshSecret,
          expiresIn: this.jwtConfig.refreshExpiresIn as StringValue,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      jti,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user);

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.userService.updateRefreshToken(
      user.id,
      hashedRefreshToken,
      tokens.jti,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload & { jti: string };

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload & { jti: string }>(
        refreshToken,
        {
          secret: this.jwtConfig.refreshSecret,
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { jti } = payload;

    if (!jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userService.findById(payload.sub);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    if (user.refreshTokenJti !== jti) {
      await this.userService.clearRefreshToken(user.id);
      throw new UnauthorizedException(
        'Token reuse detected. Please login again.',
      );
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user);

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    // ATOMIC UPDATE: Only update if the stored jti still matches the one we verified.
    // If another request already rotated this token, modifiedCount will be 0.
    const updateResult = await this.userService.updateRefreshTokenAtomic(
      user.id,
      jti,
      hashedRefreshToken,
      tokens.jti,
    );

    if (updateResult.modifiedCount === 0) {
      // Another request already used this token and rotated it.
      throw new UnauthorizedException(
        'Refresh token already used. Please login again.',
      );
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(userId: string) {
    await this.userService.clearRefreshToken(userId);

    return {
      message: 'Logged out successfully',
    };
  }
}
