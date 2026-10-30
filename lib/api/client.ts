// Centralised, typed API client (Frontend PRD §7).
// Adds base URL, sends auth cookies, and normalises errors so the UI
// can map them consistently to toasts / inline messages.

import { getAccessToken, getRefreshToken, updateAccessToken, clearTokens } from "@/lib/utils/token-storage";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string; // Optional access token for authenticated requests
}

/**
 * The access token is short-lived (15m) by design — a 401 mid-session is the
 * normal, expected way to find out it expired, not proof the session is
 * dead. Every caller routes through this so a refresh only ever happens
 * once even if several requests 401 at the same moment.
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${BASE_URL}/admin/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;

      const json = await res.json();
      const { accessToken, expiresIn } = json.data ?? json;
      if (!accessToken) return null;

      updateAccessToken(accessToken, expiresIn);
      return accessToken as string;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * A 401 that survives a refresh attempt means the session is genuinely
 * dead (refresh token itself expired/revoked) — force a logout instead of
 * letting every page render the raw "Invalid or expired token" error
 * inline. A 401 with no token to begin with (e.g. a bad-credentials login
 * attempt) is left alone.
 */
function handleUnauthorized(status: number, hadToken: boolean) {
  if (status !== 401 || !hadToken) return;
  clearTokens();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

async function doFetch(
  path: string,
  options: RequestOptions,
  accessToken: string | null,
): Promise<Response> {
  const { body, headers, ...rest } = options;
  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    credentials: "include", // send httpOnly session cookie
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token } = options;
  let accessToken = token ?? getAccessToken();

  let res = await doFetch(path, options, accessToken);

  // Don't try to refresh a login/refresh call itself — an infinite loop
  // waiting to happen — only a request that was actually carrying a token.
  if (res.status === 401 && accessToken && !token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      accessToken = newToken;
      res = await doFetch(path, options, accessToken);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const data = await res.json();
      message = data?.message ?? message;
      details = data;
    } catch {
      // non-JSON error body — keep statusText
    }
    handleUnauthorized(res.status, !!accessToken);
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Same auth/refresh handling as apiFetch, but for endpoints that return a
 * binary body (CSV/PDF exports, etc.) instead of JSON — calling res.json()
 * on those throws a parse error, which is why exports silently failed
 * before this existed.
 */
export async function apiFetchBlob(
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  return (await apiFetchBlobResponse(path, options)).blob;
}

/** Like apiFetchBlob, but also returns the response headers (e.g. X-Bulk-* counts). */
export async function apiFetchBlobResponse(
  path: string,
  options: RequestOptions = {},
): Promise<{ blob: Blob; headers: Headers }> {
  const { token } = options;
  let accessToken = token ?? getAccessToken();

  let res = await doFetch(path, options, accessToken);

  if (res.status === 401 && accessToken && !token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      accessToken = newToken;
      res = await doFetch(path, options, accessToken);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const data = await res.json();
      message = data?.message ?? message;
      details = data;
    } catch {
      // non-JSON error body — keep statusText
    }
    handleUnauthorized(res.status, !!accessToken);
    throw new ApiError(res.status, message, details);
  }

  return { blob: await res.blob(), headers: res.headers };
}

/**
 * multipart/form-data upload — bypasses apiFetch's JSON-stringify body
 * handling entirely. Do not set Content-Type manually: the browser needs to
 * add its own multipart boundary.
 */
async function doUpload(path: string, formData: FormData, accessToken: string | null): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: formData,
  });
}

export interface ApiUploadOptions {
  /** 0–100 while bytes are sent to the server (not server processing time). */
  onUploadProgress?: (percent: number) => void;
}

async function doUploadWithProgress(
  path: string,
  formData: FormData,
  accessToken: string | null,
  onUploadProgress?: (percent: number) => void,
): Promise<Response> {
  if (!onUploadProgress) {
    return doUpload(path, formData, accessToken);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "application/json" },
        }),
      );
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(formData);
  });
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options?: ApiUploadOptions,
): Promise<T> {
  let accessToken = getAccessToken();

  let res = await doUploadWithProgress(path, formData, accessToken, options?.onUploadProgress);

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      accessToken = newToken;
      res = await doUploadWithProgress(path, formData, accessToken, options?.onUploadProgress);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const data = await res.json();
      message = data?.message ?? message;
      details = data;
    } catch {
      // non-JSON error body — keep statusText
    }
    handleUnauthorized(res.status, !!accessToken);
    throw new ApiError(res.status, message, details);
  }

  return (await res.json()) as T;
}

/**
 * API client with axios-like interface
 * Wraps apiFetch to provide a familiar API
 */
export const apiClient = {
  get: async <T>(url: string, options?: { params?: Record<string, unknown> }) => {
    const queryString = options?.params
      ? "?" + new URLSearchParams(
          Object.entries(options.params)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)])
        ).toString()
      : "";
    
    const data = await apiFetch<T>(url + queryString, { method: "GET" });
    return { data };
  },

  getBlob: async (url: string, options?: { params?: Record<string, unknown> }) => {
    const queryString = options?.params
      ? "?" + new URLSearchParams(
          Object.entries(options.params)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)])
        ).toString()
      : "";

    const data = await apiFetchBlob(url + queryString, { method: "GET" });
    return { data };
  },

  post: async <T>(url: string, data?: unknown, options?: RequestOptions) => {
    const responseData = await apiFetch<T>(url, {
      method: "POST",
      body: data,
      ...options,
    });
    return { data: responseData };
  },

  patch: async <T>(url: string, data?: unknown, options?: RequestOptions) => {
    const responseData = await apiFetch<T>(url, {
      method: "PATCH",
      body: data,
      ...options,
    });
    return { data: responseData };
  },

  put: async <T>(url: string, data?: unknown, options?: RequestOptions) => {
    const responseData = await apiFetch<T>(url, {
      method: "PUT",
      body: data,
      ...options,
    });
    return { data: responseData };
  },

  delete: async <T>(url: string, options?: RequestOptions) => {
    const responseData = await apiFetch<T>(url, {
      method: "DELETE",
      ...options,
    });
    return { data: responseData };
  },
};
