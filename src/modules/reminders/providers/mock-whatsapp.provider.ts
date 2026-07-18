import { Injectable, Logger } from '@nestjs/common';

import {
  IWhatsAppProvider,
  WhatsAppMessagePayload,
  WhatsAppSendResult,
} from '../interfaces/whatsapp-provider.interface';

/**
 * Mock WhatsApp provider for development and testing.
 * Logs messages instead of sending them.
 *
 * To replace with a real provider (e.g. Twilio, Meta Business API, WATI):
 * 1. Create a new provider implementing IWhatsAppProvider
 * 2. Register it in ReminderModule providers array
 * 3. Use the same WHATSAPP_PROVIDER token
 */
@Injectable()
export class MockWhatsAppProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  readonly name = 'mock';

  async sendMessage(
    payload: WhatsAppMessagePayload,
  ): Promise<WhatsAppSendResult> {
    this.logger.log(
      `[MOCK] Would send WhatsApp to ${payload.to}:\n${payload.body}`,
    );

    return {
      success: true,
      messageId: `mock-${Date.now()}`,
      rawResponse: JSON.stringify({ mock: true }),
    };
  }
}
