import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DailyReportDto {
  @ApiPropertyOptional({
    example: '2026-07-03',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
