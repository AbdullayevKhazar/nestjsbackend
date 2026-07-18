import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import {
  ReminderLog,
  ReminderLogSchema,
} from './schemas/reminder-log.schema';
import { MockWhatsAppProvider } from './providers/mock-whatsapp.provider';
import { WHATSAPP_PROVIDER } from './constants/provider-token.constant';
import {
  Customer,
  CustomerSchema,
  configureCustomerSchema,
} from '../customers/schemas/customer.schema';
import { EncryptionService } from '../encryption/encryption.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeatureAsync([
      {
        name: ReminderLog.name,
        useFactory: () => ReminderLogSchema,
      },
      {
        name: Customer.name,
        useFactory: (encryptionService: EncryptionService) => {
          configureCustomerSchema(CustomerSchema, encryptionService);
          return CustomerSchema;
        },
        inject: [EncryptionService],
      },
    ]),
  ],
  controllers: [RemindersController],
  providers: [
    RemindersService,
    {
      provide: WHATSAPP_PROVIDER,
      useClass: MockWhatsAppProvider,
    },
  ],
  exports: [RemindersService],
})
export class RemindersModule {}
