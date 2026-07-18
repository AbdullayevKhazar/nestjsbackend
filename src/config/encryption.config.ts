import { registerAs } from '@nestjs/config';

export default registerAs('encryption', () => ({
  key: process.env.ENCRYPTION_KEY!,
  keyVersion: process.env.ENCRYPTION_KEY_VERSION || '1',
}));
