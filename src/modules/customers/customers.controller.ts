import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { GetCustomersQueryDto } from './dto/get-customers-query.dto';
import { UpdateReminderSettingsDto } from '../reminders/dto/update-reminder-settings.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { ParseObjectIdPipe } from 'src/common/pipes/parse-object-id.pipe';
import type { JwtPayload } from '../types/jwt-payload.type';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create customer',
  })
  create(
    @Body()
    createCustomerDto: CreateCustomerDto,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.customersService.create(createCustomerDto, user.sub);
  }

  @Get()
  @ApiOperation({
    summary: 'Get customers with filtering, search, sort, and pagination',
  })
  findAll(
    @Query()
    query: GetCustomersQueryDto,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.customersService.findAll(query, user.sub);
  }

  @Get('locations')
  @ApiOperation({
    summary: 'Get unique customer locations',
  })
  getLocations(@CurrentUser() user: JwtPayload) {
    return this.customersService.getLocations(user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get customer by id',
  })
  findOne(
    @Param('id', ParseObjectIdPipe)
    id: string,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.customersService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update customer',
  })
  update(
    @Param('id', ParseObjectIdPipe)
    id: string,

    @Body()
    updateCustomerDto: UpdateCustomerDto,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.customersService.update(id, updateCustomerDto, user.sub);
  }

  @Patch(':id/reminder-settings')
  @ApiOperation({
    summary: 'Update customer reminder settings',
    description:
      'Enable or disable automatic WhatsApp reminders for this customer',
  })
  updateReminderSettings(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateReminderSettingsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete customer',
  })
  remove(
    @Param('id', ParseObjectIdPipe)
    id: string,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.customersService.remove(id, user.sub);
  }
}
