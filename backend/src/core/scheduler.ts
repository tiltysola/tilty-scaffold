import { randomUUID } from 'crypto';
import schedule from 'node-schedule';

import { logger } from './logger';
import { type BackendModule, type JobDefinition } from './module';

interface SchedulerHandle {
  jobs: schedule.Job[];
}

interface SchedulerOptions {
  lock?: SchedulerLockOptions;
}

interface SchedulerLockOptions {
  cacheStore: SchedulerLockStore;
  ttlMs: number;
}

interface SchedulerLockStore {
  acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<boolean>;
  renewLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
}

interface AcquiredSchedulerLock {
  key: string;
  owner: string;
}

export function collectJobs(modules: BackendModule[]) {
  return modules.flatMap((module) => module.jobs ?? []);
}

export function startScheduler(jobs: JobDefinition[], options: SchedulerOptions = {}): SchedulerHandle {
  const scheduledJobs = jobs.map((job) => {
    const scheduledJob = schedule.scheduleJob(job.rule, async () => {
      await runJob(job, options.lock);
    });

    if (!scheduledJob) {
      throw new Error(`Invalid schedule rule for job ${job.name}: ${job.rule}`);
    }

    if (job.runOnStart) {
      void runJob(job, options.lock);
    }

    logger.info(`Registered job ${job.name} with rule "${job.rule}".`);
    return scheduledJob;
  });

  return { jobs: scheduledJobs };
}

export async function stopScheduler(handle?: SchedulerHandle) {
  if (!handle) {
    return;
  }

  for (const job of handle.jobs) {
    job.cancel();
  }
}

async function runJob(job: JobDefinition, lockOptions?: SchedulerLockOptions) {
  let lock: AcquiredSchedulerLock | undefined;
  let stopRenewal: (() => void) | undefined;

  try {
    if (lockOptions) {
      lock = await acquireJobLock(job, lockOptions);

      if (!lock) {
        return;
      }

      stopRenewal = startLockRenewal(job, lock, lockOptions);
    }

    await job.handler();
  } catch (error) {
    logger.error(`Job ${job.name} could not be completed.`, error as Error);
  } finally {
    stopRenewal?.();

    if (lock && lockOptions) {
      await releaseJobLock(job, lock, lockOptions);
    }
  }
}

async function acquireJobLock(job: JobDefinition, options: SchedulerLockOptions) {
  const key = getJobLockKey(job);
  const owner = `${process.pid}:${randomUUID()}`;
  const acquired = await options.cacheStore.acquireLock(key, owner, options.ttlMs);

  if (!acquired) {
    return undefined;
  }

  return { key, owner };
}

function startLockRenewal(job: JobDefinition, lock: AcquiredSchedulerLock, options: SchedulerLockOptions) {
  const renewIntervalMs = Math.max(Math.floor(options.ttlMs / 3), 1);
  let isActive = true;
  const timer = setInterval(() => {
    void options.cacheStore
      .renewLock(lock.key, lock.owner, options.ttlMs)
      .then((renewed) => {
        if (isActive && !renewed) {
          logger.warn(`Scheduler lock for job ${job.name} was lost before the job completed.`);
          isActive = false;
          clearInterval(timer);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          logger.error(`Scheduler lock for job ${job.name} could not be renewed.`, error as Error);
        }
      });
  }, renewIntervalMs);

  return () => {
    isActive = false;
    clearInterval(timer);
  };
}

async function releaseJobLock(job: JobDefinition, lock: AcquiredSchedulerLock, options: SchedulerLockOptions) {
  try {
    await options.cacheStore.releaseLock(lock.key, lock.owner);
  } catch (error) {
    logger.error(`Scheduler lock for job ${job.name} could not be released.`, error as Error);
  }
}

function getJobLockKey(job: JobDefinition) {
  return `scheduler-lock:${job.name}`;
}
