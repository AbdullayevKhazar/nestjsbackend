import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class MonthlyReportDto {
  @ApiPropertyOptional({
    example: 2026,
  })
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsOptional()
  @IsInt()
  @Min(2020)
  year?: number;

  @ApiPropertyOptional({
    example: 7,
  })
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
