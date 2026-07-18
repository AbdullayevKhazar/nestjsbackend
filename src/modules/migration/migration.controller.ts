import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { MigrationService } from './migration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Migration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Post('encrypt-plaintext')
  @ApiOperation({
    summary: 'Encrypt existing plaintext financial data',
    description:
      'One-time migration endpoint. Iterates all customers and transactions, ' +
      'detects plaintext financial fields, and re-saves them so the encryption ' +
      'plugin converts them to AES-256-GCM ciphertext. Safe to run multiple times.',
  })
  async runMigration() {
    const result = await this.migrationService.runMigration();
    return {
      success: true,
      ...result,
    };
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify all financial fields are encrypted',
    description:
      'Scans the entire database and reports how many documents still contain ' +
      'plaintext financial values.',
  })
  async verify() {
    const result = await this.migrationService.verifyEncryption();
    return {
      success: true,
      ...result,
    };
  }
}
