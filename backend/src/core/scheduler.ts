import schedule from 'node-schedule';

import { logger } from './logger';
import { BackendModule, JobDefinition } from './module';

export interface SchedulerHandle {
  jobs: schedule.Job[];
}

export function collectJobs(modules: BackendModule[]) {
  return modules.flatMap((module) => module.jobs ?? []);
}

export function startScheduler(jobs: JobDefinition[]): SchedulerHandle {
  const scheduledJobs = jobs.map((job) => {
    const scheduledJob = schedule.scheduleJob(job.rule, async () => {
      await runJob(job);
    });

    if (!scheduledJob) {
      throw new Error(`Invalid schedule rule for job ${job.name}: ${job.rule}`);
    }

    if (job.runOnStart) {
      void runJob(job);
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

async function runJob(job: JobDefinition) {
  try {
    await job.handler();
  } catch (error) {
    logger.error(`Job ${job.name} could not be completed.`, error as Error);
  }
}
