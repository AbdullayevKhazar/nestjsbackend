import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  connected() {
    this.logger.log('✅ MongoDB connected successfully');
  }

  disconnected() {
    this.logger.warn('❌ MongoDB disconnected');
  }

  error(error: unknown) {
    this.logger.error(error);
  }
}
