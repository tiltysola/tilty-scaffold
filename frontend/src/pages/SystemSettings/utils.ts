import {
  type SetupFieldDefinition,
  type SetupStepDefinition,
  setupSteps,
} from '@/components/SetupConfiguration/definitions';

export type SystemSettingsFieldStep = SetupStepDefinition & {
  fields: SetupFieldDefinition[];
};

export type SystemSettingsStep = SetupStepDefinition | SystemSettingsFieldStep;

export const systemSettingsSteps = setupSteps.filter((step): step is SystemSettingsStep => step.id !== 'administrator');

export function hasSettingsFields(step: SystemSettingsStep): step is SystemSettingsFieldStep {
  return Boolean(step.fields);
}
