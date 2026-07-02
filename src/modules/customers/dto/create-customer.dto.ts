import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'Əli Məmmədov',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({
    example: '+994501112233',
  })
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: 'Invalid phone number',
  })
  phone!: string;

  @ApiPropertyOptional({
    example: 'Bakı, Nizami rayonu',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({
    example: 'Məhlə dükanı',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
