import { logger } from '../../core/logger';
import { type BackendModule } from '../../core/module';

export function createDemoModule(): BackendModule {
  return {
    name: 'demo',
    prefix: '/api/demo',
    routes: [],
    jobs: [
      {
        name: 'demo.scheduler-heartbeat',
        rule: '0 * * * * *',
        runOnStart: true,
        handler: () => {
          logger.info('Scheduled demonstration job executed.');
        },
      },
    ],
  };
}
