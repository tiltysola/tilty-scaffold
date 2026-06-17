import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

import { $OpenApiUtil } from '@alicloud/openapi-core';
import SlsClient, { LogContent, LogGroup, LogItem, PutLogsRequest } from '@alicloud/sls20201230';

import { resolveApplicationPath } from './files';

export type LogArg = string | number | boolean | null | undefined | object | Error;
export type LogLevel = 'debug' | 'error' | 'info' | 'warn';
export type LogTarget = 'console' | 'local' | 'sls';

export interface SlsLoggerConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  logstore: string;
  project: string;
  source: string;
  topic: string;
}

export interface LoggerConfig {
  localPath?: string;
  sls?: SlsLoggerConfig;
  targets: LogTarget[];
}

interface LogRecord {
  args: LogArg[];
  level: LogLevel;
  message: string;
  timestamp: string;
}

interface LogSink {
  flush?: () => Promise<void>;
  write: (record: LogRecord) => Promise<void> | void;
}

const pendingWrites = new Set<Promise<void>>();
let sinks: LogSink[];

interface SerializedError {
  message: string;
  name: string;
  stack?: string;
}

type SerializedLogArg = boolean | null | number | string | SerializedError;

export function configureLogger(config: LoggerConfig) {
  const nextSinks: LogSink[] = [];

  if (config.targets.includes('console')) {
    nextSinks.push(new ConsoleLogSink());
  }

  if (config.targets.includes('local')) {
    nextSinks.push(new LocalFileLogSink(config.localPath ?? './logs/backend.log'));
  }

  if (config.targets.includes('sls')) {
    if (!config.sls) {
      throw new Error('SLS logger configuration is required when LOG_TARGETS includes sls.');
    }

    nextSinks.push(new SlsLogSink(config.sls));
  }

  sinks = nextSinks.length > 0 ? nextSinks : [new ConsoleLogSink()];
}

export async function flushLogger() {
  await Promise.allSettled([...pendingWrites]);
  await Promise.allSettled(sinks.map((sink) => sink.flush?.()).filter(isPromise));
}

function write(level: LogLevel, args: LogArg[]) {
  const record: LogRecord = {
    args,
    level,
    message: formatMessage(args),
    timestamp: new Date().toISOString(),
  };

  for (const sink of sinks) {
    trackWrite(sink.write(record));
  }
}

class ConsoleLogSink implements LogSink {
  write(record: LogRecord) {
    const prefix = `[${record.timestamp}] ${record.level.toUpperCase()}`;
    const method = record.level === 'debug' ? console.debug : console[record.level];

    method(prefix, ...record.args);
  }
}

sinks = [new ConsoleLogSink()];

class LocalFileLogSink implements LogSink {
  private readonly filePath: string;
  private readonly ready: Promise<void>;

  constructor(filePath: string) {
    this.filePath = resolveApplicationPath(filePath, 'LOG_LOCAL_PATH');
    this.ready = mkdir(dirname(this.filePath), { recursive: true }).then(() => undefined);
  }

  async write(record: LogRecord) {
    await this.ready;
    await appendFile(this.filePath, `${toJsonLine(record)}\n`, 'utf8');
  }
}

class SlsLogSink implements LogSink {
  private readonly client: SlsClient;

  constructor(private readonly config: SlsLoggerConfig) {
    this.client = new SlsClient(new $OpenApiUtil.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: config.endpoint,
    }));
  }

  async write(record: LogRecord) {
    await this.client.putLogs(
      this.config.project,
      this.config.logstore,
      new PutLogsRequest({
        body: new LogGroup({
          logItems: [
            new LogItem({
              contents: toSlsContents(record),
              time: Math.floor(Date.parse(record.timestamp) / 1000),
            }),
          ],
          source: this.config.source,
          topic: this.config.topic,
        }),
      }),
    );
  }
}

function trackWrite(result: Promise<void> | void) {
  if (!isPromise(result)) {
    return;
  }

  const pending = result
    .catch((error: unknown) => {
      console.error(`[${new Date().toISOString()}] ERROR`, 'Logger sink write could not be completed.', error);
    })
    .finally(() => {
      pendingWrites.delete(pending);
    });

  pendingWrites.add(pending);
}

function isPromise<T>(value: T | Promise<T> | undefined): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === 'function');
}

function formatMessage(args: LogArg[]) {
  if (typeof args[0] === 'string') {
    return args[0];
  }

  return args.map(stringifyArg).join(' ');
}

function toJsonLine(record: LogRecord) {
  return JSON.stringify({
    args: record.args.map(serializeArg),
    level: record.level,
    message: record.message,
    timestamp: record.timestamp,
  });
}

function toSlsContents(record: LogRecord) {
  const contents = [
    new LogContent({ key: 'timestamp', value: record.timestamp }),
    new LogContent({ key: 'level', value: record.level }),
    new LogContent({ key: 'message', value: record.message }),
  ];
  const data = record.args.slice(1).map(stringifyArg).filter(Boolean).join(' ');

  if (data) {
    contents.push(new LogContent({ key: 'data', value: data }));
  }

  return contents;
}

function serializeArg(arg: LogArg): SerializedLogArg {
  if (arg === undefined) {
    return null;
  }

  if (arg instanceof Error) {
    return {
      message: arg.message,
      name: arg.name,
      ...(arg.stack ? { stack: arg.stack } : {}),
    };
  }

  if (arg !== null && typeof arg === 'object') {
    return stringifyArg(arg);
  }

  return arg;
}

function stringifyArg(arg: LogArg): string {
  if (arg instanceof Error) {
    return JSON.stringify(serializeArg(arg));
  }

  if (arg === undefined) {
    return '';
  }

  if (arg === null || typeof arg !== 'object') {
    return String(arg);
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return '[Unserializable object]';
  }
}

export const logger = {
  debug: (...args: LogArg[]) => write('debug', args),
  error: (...args: LogArg[]) => write('error', args),
  info: (...args: LogArg[]) => write('info', args),
  warn: (...args: LogArg[]) => write('warn', args),
};
