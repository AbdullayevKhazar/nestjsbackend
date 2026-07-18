export interface WhatsAppMessagePayload {
  to: string;
  body: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  rawResponse?: string;
}

export interface IWhatsAppProvider {
  readonly name: string;
  sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult>;
}
