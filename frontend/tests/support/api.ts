export function createApiSuccessResponse<T>(data: T, init: ResponseInit = {}) {
  return new Response(
    JSON.stringify({
      code: 200,
      error: null,
      data,
    }),
    { status: 200, ...init },
  );
}
