import { loadEnv } from '../config/env';
import { configureLogger, flushLogger, logger } from '../core/logger';
import { createSequelize } from '../infra/database';
import { createMigrator } from '../infra/migrator';
import { initModels } from '../modules';
import { AccessControlService } from '../modules/access-control/access-control.service';

type DatabaseCommand = 'down' | 'status' | 'up';

const command = parseCommand(process.argv[2]);

void run(command)
  .catch((error) => {
    logger.error('Database command could not be completed.', error as Error);
    process.exitCode = 1;
  })
  .finally(flushLogger);

async function run(command: DatabaseCommand) {
  const env = loadEnv();
  configureLogger(env.logger);

  const sequelize = createSequelize(env.database);
  const models = initModels(sequelize);
  const accessControl = new AccessControlService(models);
  const migrator = createMigrator(sequelize);

  try {
    await sequelize.authenticate();

    if (command === 'up') {
      const migrations = await migrator.up();
      await accessControl.syncSystemAccessControl();
      logger.info(`Applied ${migrations.length} migration(s).`);
      return;
    }

    if (command === 'down') {
      const migrations = await migrator.down();
      logger.info(`Reverted ${migrations.length} migration(s).`);
      return;
    }

    const [executed, pending] = await Promise.all([migrator.executed(), migrator.pending()]);

    logger.info(`Executed migrations: ${executed.length}.`);
    logger.info(`Pending migrations: ${pending.length}.`);
  } finally {
    await sequelize.close();
  }
}

function parseCommand(value: string | undefined): DatabaseCommand {
  if (value === 'down' || value === 'status' || value === 'up') {
    return value;
  }

  throw new Error(`Unsupported database command: ${value ?? '(empty)'}.`);
}
