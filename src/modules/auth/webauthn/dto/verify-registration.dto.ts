import { IsObject, IsNotEmptyObject } from 'class-validator';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';

export class VerifyRegistrationDto {
  @IsObject()
  @IsNotEmptyObject()
  response!: RegistrationResponseJSON;
}
