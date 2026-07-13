import { type BackendModule } from '../../core/module';
import { HealthController, type ReadinessCheck } from './health.controller';

export { ReadinessCheckStatus, type ReadinessCheckStatusValue, readinessCheckStatusValues } from './health.controller';

interface HealthModuleOptions {
  readinessChecks?: ReadinessCheck[];
}

export type { ReadinessCheck };

export function createHealthModule(options: HealthModuleOptions = {}): BackendModule {
  const controller = new HealthController(options.readinessChecks);

  return {
    name: 'health',
    prefix: '/api/health',
    routes: [
      {
        method: 'get',
        path: '',
        handlers: [controller.health],
      },
      {
        method: 'get',
        path: '/ready',
        handlers: [controller.ready],
      },
    ],
  };
}
