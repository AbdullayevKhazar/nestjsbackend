import { IsEmail, IsOptional } from 'class-validator';

export class LoginOptionsDto {
  @IsEmail()
  @IsOptional()
  email?: string;
}
