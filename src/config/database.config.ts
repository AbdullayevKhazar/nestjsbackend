import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  uri: process.env.MONGODB_URI!,
  nodeEnv: process.env.NODE_ENV,
}));
