import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RemindersService } from './reminders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import type { JwtPayload } from '../types/jwt-payload.type';

@ApiTags('Reminders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post('send-first/:customerId')
  @ApiOperation({
    summary: 'Send first WhatsApp reminder to customer',
    description:
      'Sends a greeting message with the public debt page link. Only works if customer has a public token.',
  })
  async sendFirstReminder(
    @Param('customerId', ParseObjectIdPipe) customerId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.remindersService.sendFirstReminder(customerId, user.sub);
    return { message: 'First reminder sent successfully' };
  }

  @Get('logs/:customerId')
  @ApiOperation({
    summary: 'Get reminder logs for a customer',
  })
  async getLogs(
    @Param('customerId', ParseObjectIdPipe) customerId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.remindersService.getLogs(customerId, user.sub);
  }
}
