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
