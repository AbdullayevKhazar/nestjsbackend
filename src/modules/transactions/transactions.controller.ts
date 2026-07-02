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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

import type { JwtPayload } from '../types/jwt-payload.type';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { ParseObjectIdPipe } from 'src/common/pipes/parse-object-id.pipe';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(
    @Body()
    dto: CreateTransactionDto,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.transactionsService.create(dto, user.sub);
  }
  @Get()
  findAll(
    @Query() query: TransactionQueryDto,

    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.findAll(query, user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get transaction by id',
  })
  findOne(
    @Param('id', ParseObjectIdPipe)
    id: string,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.transactionsService.findOne(id, user.sub);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update transaction',
  })
  update(
    @Param('id', ParseObjectIdPipe)
    id: string,

    @Body()
    dto: UpdateTransactionDto,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.transactionsService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete transaction',
  })
  remove(
    @Param('id', ParseObjectIdPipe)
    id: string,

    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.transactionsService.remove(id, user.sub);
  }
}
