import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';
import { TransactionType } from '../enum/transaction-type.enum';

export class TransactionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit = 10;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}
