import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, ValidateIf } from 'class-validator';

export enum ReportPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class ReportQueryDto {
  @ApiPropertyOptional({
    enum: ReportPeriod,
    example: ReportPeriod.MONTH,
  })
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod;

  @ApiPropertyOptional({
    example: '2026-07-01',
  })
  @ValidateIf((o) => o.to !== undefined || o.from !== undefined)
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
  })
  @ValidateIf((o) => o.from !== undefined || o.to !== undefined)
  @IsDateString()
  to?: string;
}

