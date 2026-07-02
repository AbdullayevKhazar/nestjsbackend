import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ReportsService } from './reports.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

import type { JwtPayload } from '../types/jwt-payload.type';
import { DailyReportDto } from './dto/daily-report.dto';
import { MonthlyReportDto } from './dto/monthly-report.dto';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Overview report',
  })
  overview(
    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.reportsService.overview(user.sub);
  }
  @Get('report')
  report(@Query() dto: ReportQueryDto, @CurrentUser() user: JwtPayload) {
    return this.reportsService.report(dto, user.sub);
  }
}
