interface ApiSuccess<T> {
  code: 200;
  error: null;
  data: T;
}

interface ApiFailure {
  code: number;
  error: string;
  message: string;
  details?: unknown;
}

export function ok<T>(data: T): ApiSuccess<T> {
  return {
    code: 200,
    error: null,
    data,
  };
}

export function fail(status: number, error: string, message: string, details?: unknown): ApiFailure {
  return {
    code: status,
    error,
    message,
    ...(details === undefined ? {} : { details }),
  };
}
