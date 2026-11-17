// Admin-portal MFA enrollment client. These hit the same /auth/mfa/*
// endpoints the public portal uses (not /admin/auth/*) — JwtAuthGuard
// accepts an admin-signed access token there just as it does a regular
// one, so login-independent enrollment/disable needs no admin-specific
// backend surface.
import { apiClient } from './client';
import type { ApiResponse } from '../types/common';
import type { MfaMethod } from './admin-auth';

export interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaBackupCodesResponse {
  backupCodes: string[];
}

async function unwrap<T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const response = await request;
  return response.data.data;
}

export const mfaApi = {
  setupTotp: () =>
    unwrap(apiClient.post<ApiResponse<MfaSetupResponse>>('/auth/mfa/setup')),

  verifyTotpSetup: (code: string) =>
    unwrap(
      apiClient.post<ApiResponse<MfaBackupCodesResponse>>('/auth/mfa/verify-setup', { code })
    ),

  sendEmail: () =>
    unwrap(apiClient.post<ApiResponse<{ expiresIn: number }>>('/auth/mfa/send-email')),

  verifyEmailSetup: (code: string) =>
    unwrap(
      apiClient.post<ApiResponse<MfaBackupCodesResponse>>('/auth/mfa/verify-email', { code })
    ),

  disable: (password: string) =>
    unwrap(
      apiClient.post<ApiResponse<{ message: string }>>('/auth/mfa/disable', { password })
    ),
};

export type { MfaMethod };
