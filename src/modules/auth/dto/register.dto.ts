import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'Əli Məmmədov',
  })
  @IsString()
  @MinLength(3)
  fullName!: string;

  @ApiProperty({
    example: 'admin@local.com',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty({
    example: '12345678',
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
