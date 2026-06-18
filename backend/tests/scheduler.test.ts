import { describe, expect, it, vi } from 'vitest';

import { type BackendModule, type JobDefinition } from '../src/core/module';
import { collectJobs, startScheduler, stopScheduler } from '../src/core/scheduler';
import { MemoryCacheStore } from '../src/infra/cache';

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

  it('runs locked startup jobs only on the instance that acquires the lock', async () => {
    const cacheStore = new MemoryCacheStore();
    let finishFirstJob: (() => void) | undefined;
    const firstHandler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFirstJob = resolve;
        }),
    );
    const secondHandler = vi.fn();
    const firstHandle = startScheduler(
      [
        {
          name: 'test.locked-startup',
          rule: '0 * * * * *',
          runOnStart: true,
          handler: firstHandler,
        },
      ],
      {
        lock: {
          cacheStore,
          ttlMs: 60_000,
        },
      },
    );

    try {
      await vi.waitFor(() => expect(firstHandler).toHaveBeenCalledTimes(1));

      const secondHandle = startScheduler(
        [
          {
            name: 'test.locked-startup',
            rule: '0 * * * * *',
            runOnStart: true,
            handler: secondHandler,
          },
        ],
        {
          lock: {
            cacheStore,
            ttlMs: 60_000,
          },
        },
      );

      try {
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(secondHandler).not.toHaveBeenCalled();
      } finally {
        await stopScheduler(secondHandle);
      }
    } finally {
      finishFirstJob?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await stopScheduler(firstHandle);
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
