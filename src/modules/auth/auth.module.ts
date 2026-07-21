import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { UserModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { jwtConfig } from 'src/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    UserModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [jwtConfig.KEY],
      useFactory: (config: ConfigType<typeof jwtConfig>) => ({
        secret: config.secret,
        signOptions: {
          expiresIn: config.expiresIn as any,
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, CookieService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, CookieService, JwtStrategy, JwtAuthGuard],
})
export class AuthModule {}
