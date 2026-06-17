import { appConfig } from './config';

export interface ApiSuccess<T> {
  code: number;
  error: null;
  data: T;
}

export interface ApiFailure {
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
  token?: string;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const { body, headers: inputHeaders, token, ...requestOptions } = options;
  const headers = new Headers(inputHeaders);

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...requestOptions,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached.');
  }

  const payload = await readJson(response);

  if (!response.ok) {
    if (isApiFailure(payload)) {
      throw new ApiError(response.status, payload.error, payload.message, payload.details);
    }

    throw new ApiError(response.status, 'API_ERROR', 'The request could not be completed.');
  }

  if (!isApiSuccess<T>(payload)) {
    throw new ApiError(response.status, 'API_RESPONSE_ERROR', 'The server response is invalid.');
  }

  return payload.data;
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
