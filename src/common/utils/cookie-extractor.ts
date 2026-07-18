import { Request } from 'express';

/**
 * Extracts the JWT access token from the `access_token` HttpOnly cookie.
 * Compatible with passport-jwt Strategy configuration.
 */
export const cookieExtractor = (req: Request): string | null => {
  if (req && req.cookies) {
    const token = req.cookies['access_token'];
    if (typeof token === 'string') {
      return token;
    }
  }
  return null;
};
