import { Injectable } from '@nestjs/common';
import { Response } from 'express';

/**
 * Centralized cookie management for authentication tokens.
 * Enforces HttpOnly, SameSite=Lax, and Secure in production.
 */
@Injectable()
export class CookieService {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private readonly baseOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: this.isProduction,
    path: '/',
  };

  /**
   * Sets the access token cookie (15 minutes).
   */
  setAccessTokenCookie(res: Response, token: string): void {
    res.cookie('access_token', token, {
      ...this.baseOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
  }

  /**
   * Sets the refresh token cookie (30 days).
   */
  setRefreshTokenCookie(res: Response, token: string): void {
    res.cookie('refresh_token', token, {
      ...this.baseOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  /**
   * Clears both authentication cookies.
   */
  clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', {
      ...this.baseOptions,
      maxAge: 0,
    });
    res.clearCookie('refresh_token', {
      ...this.baseOptions,
      maxAge: 0,
    });
  }
}
