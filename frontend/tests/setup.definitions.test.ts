import { describe, expect, it } from 'vitest';

import { setupSteps } from '../src/components/SetupConfiguration/definitions';

describe('setup configuration definitions', () => {
  it('exposes CSP resource origins in the runtime application group', () => {
    const field = setupSteps
      .find((step) => step.id === 'runtime')
      ?.fields?.find((candidate) => candidate.key === 'APP_CSP_RESOURCE_ORIGINS');

    expect(field).toMatchObject({ group: 'application', kind: 'textarea' });
  });
});
