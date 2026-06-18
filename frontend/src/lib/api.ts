import { appConfig } from './config';

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

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
}

const defaultRequestTimeoutMs = 15_000;
const setupPath = '/setup';

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const { body, headers: inputHeaders, signal: inputSignal, ...requestOptions } = options;
  const headers = new Headers(inputHeaders);
  const requestBody = createRequestBody(body);
  const signal = createRequestSignal(inputSignal);

  if (body !== undefined && !isBodyInit(body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      credentials: 'include',
      ...requestOptions,
      body: requestBody,
      headers,
      signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached.');
  }

  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiFailure(payload)) {
      handleSetupRequiredFailure(payload);
      throw new ApiError(response.status, payload.error, payload.message, payload.details);
    }

    throw new ApiError(response.status, 'API_ERROR', 'The request could not be completed.');
  }

  if (!isApiSuccess<T>(payload)) {
    throw new ApiError(response.status, 'API_RESPONSE_ERROR', 'The server response is invalid.');
  }

  return payload.data;
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

function parseUrlOrNull(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function resolveSetupNavigationTarget() {
  const currentUrl = parseUrlOrNull(window.location.href);

  if (!currentUrl) {
    return setupPath;
  }

  const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

  if (currentPath === setupPath) {
    return null;
  }

  return setupPath;
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

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

async function readJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(response.status, 'API_RESPONSE_ERROR', 'The server response is invalid.');
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
