import { bootstrap } from './bootstrap';
import { getEnvValidationMessage, hasEnvFile } from './config/env';
import { flushLogger, logger } from './core/logger';
import { bootstrapSetup } from './setup-bootstrap';

const envValidationMessage = getEnvValidationMessage();

if (!hasEnvFile()) {
  bootstrapSetup().catch(handleStartupError);
} else if (envValidationMessage) {
  logger.error(envValidationMessage);
  process.exit(1);
} else {
  bootstrap().catch(handleStartupError);
}

async function handleStartupError(error: unknown) {
  const startupError = error instanceof Error ? error : new Error(String(error));

  logger.error('Application bootstrap could not be completed.', startupError);
  await flushLogger();
  process.exit(1);
}
