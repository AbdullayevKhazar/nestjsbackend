import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FinancialEvent,
  FinancialEventSchema,
} from './schemas/financial-event.schema';
import { FinancialEventsService } from './financial-events.service';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FinancialEvent.name, schema: FinancialEventSchema },
    ]),
    EncryptionModule,
  ],
  providers: [FinancialEventsService],
  exports: [FinancialEventsService],
})
export class FinancialEventsModule {}
