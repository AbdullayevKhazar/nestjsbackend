import {
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtPayload } from '../types/jwt-payload.type';
import type { Express, Response } from 'express';

@ApiTags('Backup')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export backup',
  })
  async exportBackup(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const backup = await this.backupService.exportBackup(user.sub);

    const date = new Date().toISOString().split('T')[0];

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="borc-defteri-backup-${date}.json"`,
    );

    res.setHeader('Content-Type', 'application/json');

    res.send(JSON.stringify(backup, null, 2));
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Import backup' })
  @UseInterceptors(FileInterceptor('file'))
  importBackup(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.backupService.importBackup(file, user.sub);
  }
}
