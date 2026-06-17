import { describe, expect, it, vi } from 'vitest';

import { BackendModule, JobDefinition } from '../src/core/module';
import { collectJobs, startScheduler, stopScheduler } from '../src/core/scheduler';

describe('scheduler', () => {
  it('collects jobs from registered modules', () => {
    const job: JobDefinition = {
      name: 'test.job',
      rule: '0 * * * * *',
      handler: () => undefined,
    };
    const module: BackendModule = {
      name: 'test',
      prefix: '/test',
      routes: [],
      jobs: [job],
    };

    expect(collectJobs([module])).toEqual([job]);
  });

  it('starts, runs startup jobs, and stops scheduled jobs', () => {
    const handler = vi.fn();
    const handle = startScheduler([
      {
        name: 'test.startup',
        rule: '0 * * * * *',
        runOnStart: true,
        handler,
      },
    ]);

    try {
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handle.jobs).toHaveLength(1);
    } finally {
      stopScheduler(handle);
    }
  });

  it('rejects invalid schedule rules', () => {
    expect(() =>
      startScheduler([
        {
          name: 'test.invalid',
          rule: 'not a rule',
          handler: () => undefined,
        },
      ]),
    ).toThrow('Invalid schedule rule');
  });
});
