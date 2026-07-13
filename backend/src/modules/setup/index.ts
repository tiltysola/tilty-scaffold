import { type BackendModule } from '../../core/module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

export function createSetupModule(service: SetupService): BackendModule {
  const controller = new SetupController(service);

  return {
    name: 'setup',
    prefix: '/api/setup',
    routes: [
      {
        method: 'get',
        path: '/defaults',
        handlers: [controller.defaults],
      },
      {
        method: 'post',
        path: '/validate',
        handlers: [controller.validate],
      },
      {
        method: 'post',
        path: '/validate/environment',
        handlers: [controller.validateEnvironment],
      },
      {
        method: 'post',
        path: '/test/database',
        handlers: [controller.testDatabase],
      },
      {
        method: 'post',
        path: '/test/cache',
        handlers: [controller.testCache],
      },
      {
        method: 'post',
        path: '/test/file-storage',
        handlers: [controller.testFileStorage],
      },
      {
        method: 'post',
        path: '/test/logging',
        handlers: [controller.testLogging],
      },
      {
        method: 'post',
        path: '/test/email',
        handlers: [controller.testEmail],
      },
      {
        method: 'post',
        path: '/test/sms',
        handlers: [controller.testSms],
      },
      {
        method: 'post',
        path: '/test/sso',
        handlers: [controller.testSso],
      },
      {
        method: 'post',
        path: '/complete',
        handlers: [controller.complete],
      },
    ],
  };
}

export function createLockedSetupModule() {
  return createSetupModule(new SetupService('locked'));
}

export function createSetupOnlyModule() {
  return createSetupModule(new SetupService('setup'));
}
