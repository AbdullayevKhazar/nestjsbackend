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

export const ALLOWED_SORT_VALUES = [
  'balance_asc',
  'balance_desc',
  'created_asc',
  'created_desc',
  'name_asc',
  'name_desc',
  'lastTransaction_asc',
  'lastTransaction_desc',
] as const;

export type CustomerSortValue = (typeof ALLOWED_SORT_VALUES)[number];

/**
 * Dedicated query DTO for listing customers.
 *
 * Validates and transforms all query parameters for the GET /customers endpoint.
 * Designed for easy extension with additional filters (e.g. minBalance, maxBalance,
 * dateRange, isPublic, includeDeleted, lastPaymentDate) without touching the service.
 */
export class GetCustomersQueryDto {
  @ApiPropertyOptional({ default: 1, description: 'Page number (1-based)' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({
    default: 20,
    description: 'Items per page (max 100)',
  })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional({
    description: 'Case-insensitive search across fullName, phone, and location',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by exact location. If empty or omitted, returns all.',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    default: 'created_desc',
    enum: ALLOWED_SORT_VALUES,
    description: 'Sort field and direction',
  })
  @IsOptional()
  @IsIn(ALLOWED_SORT_VALUES)
  sort: CustomerSortValue = 'created_desc';

  @ApiPropertyOptional({
    default: false,
    description: 'Filter by overdue status (has debt AND last payment > 7 days ago)',
  })
  @Transform(({ value }) => value === 'true')
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;
}
