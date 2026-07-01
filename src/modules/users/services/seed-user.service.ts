import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UserService } from '../users.service';

@Injectable()
export class SeedUserService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedUserService.name);

  constructor(private readonly userService: UserService) {}

  async onApplicationBootstrap() {
    const count = await this.userService.countUsers();

    if (count > 0) {
      this.logger.log('Users already exist. Skipping admin seed.');
      return;
    }

    const hashedPassword = await bcrypt.hash('12345678', 10);

    await this.userService.create({
      fullName: 'Administrator',
      email: 'admin@local.com',
      password: hashedPassword,
    });

    this.logger.log('✅ Default admin created');
    this.logger.warn('Email: admin@local.com');
    this.logger.warn('Password: 12345678');
  }
}
