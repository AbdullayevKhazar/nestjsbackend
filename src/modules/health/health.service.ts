import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth() {
    return {
      message: 'API is running',
      data: {
        timestamp: new Date().toISOString(),
      },
    };
  }
}
