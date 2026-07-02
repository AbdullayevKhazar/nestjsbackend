import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

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

    await this.userService.create({
      fullName: 'Administrator',
      email: 'admin@local.com',
      password: '12345678',
    });

    this.logger.log('✅ Default admin created');
  }
}
