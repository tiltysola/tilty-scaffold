import { bootstrap } from './bootstrap';
import { getEnvValidationMessage } from './config/env';
import { flushLogger, logger } from './core/logger';

const envValidationMessage = getEnvValidationMessage();

if (envValidationMessage) {
  logger.error(envValidationMessage);
  process.exit(1);
}

bootstrap().catch(async (error: unknown) => {
  const startupError = error instanceof Error ? error : new Error(String(error));

  logger.error('Application bootstrap could not be completed.', startupError);
  await flushLogger();
  process.exit(1);
});
