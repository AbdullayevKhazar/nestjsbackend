import { IsObject, IsNotEmptyObject } from 'class-validator';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';

export class VerifyAuthenticationDto {
  @IsObject()
  @IsNotEmptyObject()
  response!: AuthenticationResponseJSON;
}
