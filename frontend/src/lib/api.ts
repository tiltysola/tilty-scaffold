import { formatStaticMessage, getCurrentLocale } from '@/i18n';
import { routePath } from '@/router';
import { localeRequestHeader } from '@tilty/shared/i18n';

import { getClientDeviceId } from './device';

interface ApiSuccess<T> {
  code: number;
  error: null;
  data: T;
}

interface ApiFailure {
  code: number;
  error: string;
  message: string;
  details?: unknown;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const defaultRequestTimeoutMs = 15_000;

export async function apiRequest<T>(apiRequestPath: string, options: ApiRequestOptions = {}) {
  const { body, headers: inputHeaders, signal: inputSignal, ...requestOptions } = options;
  const sameOriginApiPath = resolveSameOriginApiPath(apiRequestPath);
  const headers = new Headers(inputHeaders);
  const requestBody = createRequestBody(body);
  const signal = createRequestSignal(inputSignal);

  if (!headers.has(localeRequestHeader)) {
    headers.set(localeRequestHeader, getCurrentLocale());
  }

  if (body !== undefined && !isBodyInit(body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const deviceId = getClientDeviceId();

  if (deviceId && !headers.has('X-Device-Id')) {
    headers.set('X-Device-Id', deviceId);
  }

  let response: Response;

  try {
    response = await fetch(sameOriginApiPath, {
      credentials: 'include',
      ...requestOptions,
      body: requestBody,
      headers,
      signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', formatStaticMessage('api.error.NETWORK_ERROR'));
  }

  const responsePayload = await readJson(response);

  if (!response.ok) {
    if (isApiFailure(responsePayload)) {
      handleSetupRequiredFailure(responsePayload);
      throw new ApiError(response.status, responsePayload.error, responsePayload.message, responsePayload.details);
    }

    throw new ApiError(response.status, 'API_ERROR', formatStaticMessage('api.error.API_ERROR'));
  }

  if (!isApiSuccess<T>(responsePayload)) {
    throw new ApiError(response.status, 'API_RESPONSE_ERROR', formatStaticMessage('api.error.API_RESPONSE_ERROR'));
  }

  return responsePayload.data;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }

  return fallback;
}

function resolveSameOriginApiPath(apiRequestPath: string) {
  if (!apiRequestPath.startsWith('/api/')) {
    throw new ApiError(0, 'API_PATH_INVALID', formatStaticMessage('api.error.API_PATH_INVALID'));
  }

  return apiRequestPath;
}

function createRequestBody(body: unknown) {
  if (body === undefined) {
    return undefined;
  }

  return isBodyInit(body) ? body : JSON.stringify(body);
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof FormData !== 'undefined' && value instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) ||
    (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) ||
    ArrayBuffer.isView(value) ||
    (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
  );
}

function createRequestSignal(inputSignal?: AbortSignal | null) {
  const timeoutSignal = AbortSignal.timeout(defaultRequestTimeoutMs);

  if (!inputSignal) {
    return timeoutSignal;
  }

  return AbortSignal.any([inputSignal, timeoutSignal]);
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'API_RESPONSE_ERROR', formatStaticMessage('api.error.API_RESPONSE_ERROR'));
  }
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return Boolean(
    value && typeof value === 'object' && 'data' in value && (value as Record<string, unknown>).error === null,
  );
}

function isApiFailure(value: unknown): value is ApiFailure {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return typeof payload.code === 'number' && typeof payload.error === 'string' && typeof payload.message === 'string';
}

function handleSetupRequiredFailure(payload: ApiFailure) {
  if (payload.error !== 'SETUP_REQUIRED' || typeof window === 'undefined') {
    return;
  }

  const navigationTarget = resolveSetupNavigationTarget();

  if (navigationTarget) {
    window.location.replace(navigationTarget);
  }
}

function resolveSetupNavigationTarget() {
  const currentUrl = parseUrlOrNull(window.location.href);

  if (!currentUrl) {
    return routePath('setup');
  }

  const currentBrowserPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

  if (currentBrowserPath === routePath('setup')) {
    return null;
  }

  return routePath('setup');
}

function parseUrlOrNull(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
