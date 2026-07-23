import { type Middleware } from 'koa';

import { type BackendModule } from '../../core/module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { type SetupAccessService } from './setup-access';

interface SetupModuleOptions {
  access?: SetupAccessService;
  completeRateLimit?: Middleware;
  probeRateLimit?: Middleware;
  rateLimit?: Middleware;
}

interface SetupOnlyModuleOptions extends SetupModuleOptions {
  onCompleted?: () => Promise<void> | void;
}

export function createSetupModule(service: SetupService, options: SetupModuleOptions = {}): BackendModule {
  const controller = new SetupController(service, options.access);
  const protectedHandlers = (handler: Middleware, rateLimit = options.rateLimit) => [
    ...(rateLimit ? [rateLimit] : []),
    ...(options.access ? [options.access.requireAccess] : []),
    handler,
  ];

  return {
    name: 'setup',
    prefix: '/api/setup',
    routes: [
      ...(options.access
        ? [
            {
              method: 'post' as const,
              path: '/unlock',
              handlers: [...(options.completeRateLimit ? [options.completeRateLimit] : []), options.access.unlock],
            },
          ]
        : []),
      {
        method: 'get',
        path: '/defaults',
        handlers: protectedHandlers(controller.defaults),
      },
      {
        method: 'post',
        path: '/validate',
        handlers: protectedHandlers(controller.validate),
      },
      {
        method: 'post',
        path: '/validate/environment',
        handlers: protectedHandlers(controller.validateEnvironment),
      },
      {
        method: 'post',
        path: '/test/database',
        handlers: protectedHandlers(controller.testDatabase, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/test/cache',
        handlers: protectedHandlers(controller.testCache, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/test/file-storage',
        handlers: protectedHandlers(controller.testFileStorage, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/test/logging',
        handlers: protectedHandlers(controller.testLogging, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/test/email',
        handlers: protectedHandlers(controller.testEmail, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/test/sms',
        handlers: protectedHandlers(controller.testSms, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/test/sso',
        handlers: protectedHandlers(controller.testSso, options.probeRateLimit),
      },
      {
        method: 'post',
        path: '/complete',
        handlers: protectedHandlers(controller.complete, options.completeRateLimit),
      },
    ],
  };
}

export function createLockedSetupModule() {
  return createSetupModule(new SetupService('locked'));
}

export function createSetupOnlyModule(options: SetupOnlyModuleOptions = {}) {
  return createSetupModule(
    new SetupService('setup', {
      ...(options.onCompleted ? { onCompleted: options.onCompleted } : {}),
    }),
    options,
  );
}
