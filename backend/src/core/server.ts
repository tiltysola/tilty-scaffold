import { existsSync } from 'fs';
import { type Server } from 'http';
import { resolve } from 'path';

import { logger } from './logger';

export const frontendDistDirectory = resolve(__dirname, '../../../frontend/dist');
const frontendEntryFilePath = resolve(frontendDistDirectory, 'index.html');

export function warnIfFrontendEntryFileMissing() {
  if (!existsSync(frontendEntryFilePath)) {
    logger.warn(
      `Frontend entry file was not found at ${frontendEntryFilePath}. Backend-served browser routes require npm run build:frontend.`,
    );
  }
}

export function listen(server: Server, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}

export function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
