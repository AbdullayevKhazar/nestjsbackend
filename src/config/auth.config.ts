import { registerAs } from '@nestjs/config';
import type { StringValue } from 'ms';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as StringValue,
}));
