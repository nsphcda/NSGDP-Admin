/**
 * API Routes Configuration
 * Single source of truth for all API endpoint paths
 * 
 * IMPORTANT:
 * - BASE_URL from NEXT_PUBLIC_API_URL already includes /api/v1
 * - Example: http://localhost:3001/api/v1
 * - All paths here are relative to BASE_URL
 * - Do NOT add /api or /v1 prefix to paths below
 * - Final URLs: BASE_URL + path = http://localhost:3001/api/v1/auth/login
 */

export const API_ROUTES = {
  // Authentication endpoints
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
    updateProfile: '/auth/me',
    changePassword: '/auth/change-password',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },

  // User endpoints
  users: {
    downloads: '/users/me/downloads',
    dashboardSummary: '/users/me/dashboard-summary',
  },

  // Development Partner endpoints
  developmentPartners: {
    list: '/development-partners',
    bySlug: (slug: string) => `/development-partners/${slug}`,
  },

  // Category endpoints
  categories: {
    list: '/categories',
    bySlug: (slug: string) => `/categories/${slug}`,
  },

  // Dataset endpoints
  datasets: {
    list: '/datasets',
    bySlug: (slug: string) => `/datasets/${slug}`,
    create: '/datasets',
    update: (slug: string) => `/datasets/${slug}`,
    delete: (slug: string) => `/datasets/${slug}`,
    submit: (slug: string) => `/datasets/${slug}/submit-for-review`,
    download: (slug: string) => `/datasets/${slug}/download`,
    versions: (slug: string) => `/datasets/${slug}/versions`,
    preview: (slug: string) => `/datasets/${slug}/preview`,
  },

  // Upload endpoints
  uploads: {
    upload: '/uploads',
    status: (jobId: string) => `/uploads/${jobId}`,
    cancel: (jobId: string) => `/uploads/${jobId}`,
  },

  // Notification endpoints
  notifications: {
    list: '/notifications',
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: '/notifications/read-all',
  },

  // Admin endpoints
  admin: {
    users: {
      list: '/admin/users',
      stats: '/admin/users/stats',
      byId: (id: string) => `/admin/users/${id}`,
      updateRole: (id: string) => `/admin/users/${id}/role`,
      updateStatus: (id: string) => `/admin/users/${id}/status`,
    },
    datasets: {
      reviewQueue: '/admin/review-queue',
      approve: (id: string) => `/admin/datasets/${id}/approve`,
      reject: (id: string) => `/admin/datasets/${id}/reject`,
      revise: (id: string) => `/admin/datasets/${id}/revise`,
    },
    cleanup: {
      datasets: '/admin/cleanup/datasets',
      permanentlyDelete: (slug: string) =>
        `/admin/cleanup/datasets/${encodeURIComponent(slug)}`,
      bulkDelete: '/admin/cleanup/datasets/bulk-delete',
    },
    audit: {
      logs: '/admin/audit-logs',
      export: '/admin/audit-logs/export',
    },
  },

  // Search endpoints
  search: {
    query: '/search',
    suggest: '/search/suggest',
    facilities: '/search/facilities',
  },

  // Partner data endpoints
  partnerData: {
    list: '/partner-data',
    stats: '/partner-data/stats',
  },
} as const;
