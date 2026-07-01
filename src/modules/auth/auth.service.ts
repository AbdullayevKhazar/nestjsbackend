import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UserService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../types/jwt-payload.type';
import { UserDocument } from '../users/schemas/user.schema';
import { TokenPair } from '../types/token-pair.type';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { jwtConfig as jwtConfiguration } from '../../config';
import type { StringValue } from 'ms';
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,

    @Inject(jwtConfiguration.KEY)
    private readonly jwtConfig: ConfigType<typeof jwtConfiguration>,
  ) {}

  private async generateTokens(user: UserDocument): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.jwtConfig.refreshSecret,
        expiresIn: this.jwtConfig.refreshExpiresIn as StringValue,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
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

    await this.userService.updateRefreshToken(user.id, hashedRefreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }
  async refresh(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.jwtConfig.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userService.findById(payload.sub);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }
    console.log('Payload sub:', payload.sub);

    console.log('Incoming token:', refreshToken);

    console.log('HASH FROM FIND BY ID:', user?.refreshToken);

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken!,
    );

    console.log('COMPARE:', isRefreshTokenValid);

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user);
    console.log(tokens.refreshToken);

    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.userService.updateRefreshToken(user.id, hashedRefreshToken);

    return tokens;
  }
  async logout(userId: string) {
    await this.userService.clearRefreshToken(userId);

    return {
      message: 'Logged out successfully',
    };
  }
}
