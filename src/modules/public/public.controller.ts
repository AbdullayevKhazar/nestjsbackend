import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PublicService } from './public.service';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('customer/:token')
  findCustomer(@Param('token') token: string) {
    return this.publicService.findCustomer(token);
  }
}
