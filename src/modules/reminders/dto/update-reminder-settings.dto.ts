import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateReminderSettingsDto {
  @ApiPropertyOptional({
    description: 'Enable or disable automatic WhatsApp reminders',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;
}
