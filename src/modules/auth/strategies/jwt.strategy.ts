import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { ConfigType } from '@nestjs/config';
import { Strategy } from 'passport-jwt';
import { Inject } from '@nestjs/common';
import { jwtConfig } from 'src/config';
import type { JwtPayload } from 'src/modules/types/jwt-payload.type';
import { UserService } from '../../users/users.service';
import { cookieExtractor } from '../../../common/utils/cookie-extractor';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(jwtConfig.KEY)
    config: ConfigType<typeof jwtConfig>,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return payload;
  }
}
