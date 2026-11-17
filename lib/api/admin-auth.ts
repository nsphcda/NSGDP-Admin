import { apiClient } from './client';
import type { ApiResponse } from '../types/common';

async function unwrapResponse<T>(
  request: Promise<{ data: ApiResponse<T> }>
): Promise<{ data: T }> {
  const response = await request;
  return { data: response.data.data };
}

export type MfaMethod = 'totp' | 'email';

export interface AdminLoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AdminUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  role: 'super_admin' | 'staff';
  mfaEnabled: boolean;
  mfaMethod?: MfaMethod | null;
  groupId: string | null;
  groupName: string | null;
  lastLoginAt?: Date;
  lastLoginIp?: string;
}

export interface AdminAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  requiresMfa: boolean;
  mfaMethod?: MfaMethod | null;
  user: AdminUserProfile;
}

export interface VerifyMfaRequest {
  email: string;
  password: string;
  mfaCode: string;
}

export const adminAuthApi = {
  /**
   * Admin login - only for super admin users
   */
  login: (data: AdminLoginRequest) =>
    unwrapResponse(
      apiClient.post<ApiResponse<AdminAuthResponse>>('/admin/auth/login', data)
    ),

  /**
   * Verify MFA code and complete admin login
   */
  verifyMfa: (data: VerifyMfaRequest) =>
    unwrapResponse(
      apiClient.post<ApiResponse<AdminAuthResponse>>('/admin/auth/verify-mfa', data)
    ),

  /**
   * Refresh admin access token
   */
  refresh: (refreshToken: string) =>
    unwrapResponse(
      apiClient.post<ApiResponse<{ accessToken: string; expiresIn: number }>>(
        '/admin/auth/refresh',
        { refreshToken }
      )
    ),

  /**
   * Admin logout - revoke refresh token
   */
  logout: (refreshToken: string) =>
    apiClient.post<void>('/admin/auth/logout', { refreshToken }),

  /**
   * Get admin profile
   */
  getProfile: () =>
    unwrapResponse(
      apiClient.get<ApiResponse<AdminUserProfile>>('/admin/auth/me')
    ),
};
