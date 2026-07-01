export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, createTimeoutError: () => Error) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(createTimeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
