import { type QueryInterface, type Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

import { migrations } from '../migrations';

export function createMigrator(sequelize: Sequelize) {
  return new Umzug<QueryInterface>({
    context: sequelize.getQueryInterface(),
    logger: undefined,
    migrations,
    storage: new SequelizeStorage({
      sequelize,
      tableName: 'sequelize_meta',
    }),
  });
}

export async function assertDatabaseMigrationsApplied(sequelize: Sequelize) {
  const pendingMigrations = await createMigrator(sequelize).pending();

  if (pendingMigrations.length === 0) {
    return;
  }

  const pendingNames = pendingMigrations.map((migration) => migration.name).join(', ');

  throw new Error(
    [
      `Database migrations are pending: ${pendingNames}.`,
      'Run `npm run db:migrate` from backend/ before starting the backend.',
      'Startup does not apply schema migrations automatically.',
    ].join(' '),
  );
}
