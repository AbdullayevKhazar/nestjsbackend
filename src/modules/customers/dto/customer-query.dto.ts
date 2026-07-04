import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CustomerQueryDto {
  @ApiPropertyOptional({
    default: 1,
  })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({
    default: 10,
  })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 10;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    default: 'createdAt',
    enum: ['createdAt', 'fullName'],
  })
  @IsOptional()
  @IsIn(['createdAt', 'fullName'])
  sortBy = 'createdAt';

  @ApiPropertyOptional({
    default: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
  @ApiPropertyOptional({
    default: false,
  })
  @Transform(({ value }) => value === 'true')
  @IsOptional()
  @IsBoolean()
  hasDebt = false;
}
