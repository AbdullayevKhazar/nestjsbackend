import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';

import {
  Customer,
  CustomerDocument,
} from '../customers/schemas/customer.schema';
import {
  ReminderLog,
  ReminderLogDocument,
  ReminderStatus,
} from './schemas/reminder-log.schema';
import type {
  IWhatsAppProvider,
  WhatsAppMessagePayload,
} from './interfaces/whatsapp-provider.interface';
import { WHATSAPP_PROVIDER } from './constants/provider-token.constant';
import { EncryptionService } from '../encryption/encryption.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(ReminderLog.name)
    private readonly reminderLogModel: Model<ReminderLogDocument>,

    @Inject(WHATSAPP_PROVIDER)
    private readonly whatsappProvider: IWhatsAppProvider,

    private readonly encryptionService: EncryptionService,

    private readonly configService: ConfigService,
  ) {}

  // ========================================================================
  // Public helpers
  // ========================================================================

  private getPublicUrl(token: string): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
    return `${frontendUrl}/public/${token}`;
  }

  private formatPhoneForWhatsApp(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    // Ensure it starts with country code
    if (digits.startsWith('0')) {
      return digits.replace(/^0/, '');
    }
    return digits;
  }

  private decryptBalance(customer: CustomerDocument): number {
    return this.encryptionService.decrypt<number>(
      customer.balance ?? 'v1:aaaa:aaaa:MA==',
    );
  }

  // ========================================================================
  // Message builders
  // ========================================================================

  private buildFirstReminderMessage(
    customerName: string,
    publicUrl: string,
  ): string {
    return `Salam ${customerName}! 👋\n\nSizin borc məlumatlarınızı izləyə biləcəyiniz şəxsi səhifəniz hazırdır:\n\n${publicUrl}\n\nBu linkdən istifadə edərək cari borc balansınızı və ödəniş tarixçənizi hər zaman görə bilərsiniz.`;
  }

  private buildAutomaticReminderMessage(
    customerName: string,
    balance: number,
    publicUrl: string,
  ): string {
    const formattedBalance = balance.toLocaleString('az-AZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return `Salam ${customerName}! 👋\n\nCari borc balansınız: ${formattedBalance} AZN\n\nBorc məlumatlarınızı izləmək üçün:\n${publicUrl}\n\nZəhmət olmasa, ödənişinizi vaxtında edin. Hər hansı sualınız varsa, bizimlə əlaqə saxlayın.`;
  }

  // ========================================================================
  // Core send logic
  // ========================================================================

  private async sendWhatsAppAndLog(
    customer: CustomerDocument,
    message: string,
    isFirstReminder: boolean,
  ): Promise<void> {
    const payload: WhatsAppMessagePayload = {
      to: this.formatPhoneForWhatsApp(customer.phone),
      body: message,
    };

    let result;
    try {
      result = await this.whatsappProvider.sendMessage(payload);
    } catch (err: any) {
      result = {
        success: false,
        error: err?.message ?? 'Unknown provider error',
        rawResponse: undefined,
      };
    }

    // Update last reminder date regardless of success (to avoid spam)
    await this.customerModel.updateOne(
      { _id: customer._id },
      { $set: { lastReminderSentAt: new Date() } },
    );

    // Log the attempt
    await this.reminderLogModel.create({
      customerId: customer._id,
      status: result.success ? ReminderStatus.SENT : ReminderStatus.FAILED,
      providerResponse: result.rawResponse ?? null,
      error: result.error ?? null,
      messageContent: message,
      isFirstReminder,
    });

    if (result.success) {
      this.logger.log(
        `Reminder ${isFirstReminder ? '(first)' : '(auto)'} sent to ${customer.fullName} (${customer.phone})`,
      );
    } else {
      this.logger.error(
        `Failed to send reminder to ${customer.fullName}: ${result.error}`,
      );
    }
  }

  // ========================================================================
  // Manual first reminder
  // ========================================================================

  async sendFirstReminder(customerId: string, userId: string): Promise<void> {
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(customerId),
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.publicToken) {
      throw new BadRequestException('Customer does not have a public token');
    }

    const publicUrl = this.getPublicUrl(customer.publicToken);
    const message = this.buildFirstReminderMessage(
      customer.fullName,
      publicUrl,
    );

    await this.sendWhatsAppAndLog(customer, message, true);
  }

  // ========================================================================
  // Automatic reminders (cron)
  // ========================================================================

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendAutomaticReminders(): Promise<void> {
    this.logger.log('Starting automatic reminder job...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find customers who:
    // - Have reminders enabled
    // - Have unpaid debt (hasDebt = true)
    // - Either never sent a reminder OR last sent >= 7 days ago
    const customers = await this.customerModel
      .find({
        isDeleted: false,
        reminderEnabled: true,
        hasDebt: true,
        $or: [
          { lastReminderSentAt: { $eq: null } },
          { lastReminderSentAt: { $lte: sevenDaysAgo } },
        ],
      })
      .lean();

    this.logger.log(`Found ${customers.length} customers for reminder`);

    for (const rawCustomer of customers) {
      const customer = rawCustomer as unknown as CustomerDocument;
      try {
        const balance = this.decryptBalance(customer);

        if (balance <= 0) {
          // Edge case: hasDebt flag might be stale
          this.logger.warn(
            `Skipping customer ${customer.fullName}: balance is ${balance} but hasDebt is true`,
          );
          await this.reminderLogModel.create({
            customerId: customer._id,
            status: ReminderStatus.SKIPPED,
            messageContent: 'Skipped: balance <= 0',
          });
          continue;
        }

        const publicUrl = this.getPublicUrl(customer.publicToken!);
        const message = this.buildAutomaticReminderMessage(
          customer.fullName,
          balance,
          publicUrl,
        );

        await this.sendWhatsAppAndLog(customer, message, false);
      } catch (err: any) {
        this.logger.error(
          `Error processing reminder for ${customer.fullName}: ${err.message}`,
        );
        await this.reminderLogModel.create({
          customerId: customer._id,
          status: ReminderStatus.FAILED,
          error: err.message ?? 'Unknown error',
        });
      }
    }

    this.logger.log('Automatic reminder job completed');
  }

  // ========================================================================
  // Logs
  // ========================================================================

  async getLogs(customerId: string, userId: string) {
    // Verify customer belongs to user
    const customer = await this.customerModel.findOne({
      _id: new Types.ObjectId(customerId),
      createdBy: new Types.ObjectId(userId),
      isDeleted: false,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const logs = await this.reminderLogModel
      .find({ customerId: new Types.ObjectId(customerId) })
      .sort({ createdAt: -1 })
      .lean();

    return logs;
  }
}
