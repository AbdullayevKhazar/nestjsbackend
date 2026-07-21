import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../../users/users.module';
import { AuthModule } from '../auth.module';
import { WebAuthnController } from './webauthn.controller';
import { WebAuthnService } from './webauthn.service';
import { Passkey, PasskeySchema } from './schemas/passkey.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Passkey.name, schema: PasskeySchema },
    ]),
    UserModule,
    AuthModule,
  ],
  controllers: [WebAuthnController],
  providers: [WebAuthnService],
})
export class WebAuthnModule {}
