import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

import { resolveRuntimePath } from '../core/files';
import {
  formatLogRecordAsJsonLine,
  formatLogRecordData,
  type LogRecord,
  type LogSink,
  setLoggerSinks,
} from '../core/logger';

type LogTarget = 'console' | 'local' | 'sls';

interface SlsLoggerConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  logstore: string;
  project: string;
  source: string;
  topic: string;
}

interface LoggerConfig {
  localPath?: string;
  maxPendingWrites?: number;
  sls?: SlsLoggerConfig;
  targets: LogTarget[];
  writeTimeoutMs?: number;
}

interface OpenApiUtilRuntime {
  Config: new (config: { accessKeyId: string; accessKeySecret: string; endpoint: string }) => unknown;
}

interface SlsClientRuntime {
  putLogs(project: string, logstore: string, request: unknown): Promise<unknown>;
}

interface SlsRuntime {
  Client: new (config: unknown) => SlsClientRuntime;
  LogContent: new (input: { key: string; value: string }) => unknown;
  LogGroup: new (input: { logItems: unknown[]; source: string; topic: string }) => unknown;
  LogItem: new (input: { contents: unknown[]; time: number }) => unknown;
  OpenApiUtil: OpenApiUtilRuntime;
  PutLogsRequest: new (input: { body: unknown }) => unknown;
}

class ConsoleLogSink implements LogSink {
  write(record: LogRecord) {
    const prefix = `[${record.timestamp}] ${record.level.toUpperCase()}`;
    const method = record.level === 'debug' ? console.debug : console[record.level];

    method(prefix, ...record.args);
  }
}

class LocalFileLogSink implements LogSink {
  private readonly filePath: string;
  private readonly ready: Promise<void>;

  constructor(filePath: string) {
    this.filePath = resolveRuntimePath(filePath, 'LOG_LOCAL_PATH');
    this.ready = mkdir(dirname(this.filePath), { recursive: true }).then(() => undefined);
  }

  async write(record: LogRecord) {
    await this.ready;
    await appendFile(this.filePath, `${formatLogRecordAsJsonLine(record)}\n`, 'utf8');
  }
}

class SlsLogSink implements LogSink {
  private client: Promise<SlsClientRuntime> | undefined;
  private runtime: Promise<SlsRuntime> | undefined;

  constructor(private readonly config: SlsLoggerConfig) {}

  async write(record: LogRecord) {
    const runtime = await this.getRuntime();
    const client = await this.getClient(runtime);

    await client.putLogs(
      this.config.project,
      this.config.logstore,
      new runtime.PutLogsRequest({
        body: new runtime.LogGroup({
          logItems: [
            new runtime.LogItem({
              contents: toSlsContents(record, runtime.LogContent),
              time: Math.floor(Date.parse(record.timestamp) / 1000),
            }),
          ],
          source: this.config.source,
          topic: this.config.topic,
        }),
      }),
    );
  }

  private async getRuntime() {
    this.runtime ??= loadSlsRuntime();
    return this.runtime;
  }

  private async getClient(runtime: SlsRuntime) {
    this.client ??= Promise.resolve(
      new runtime.Client(
        new runtime.OpenApiUtil.Config({
          accessKeyId: this.config.accessKeyId,
          accessKeySecret: this.config.accessKeySecret,
          endpoint: this.config.endpoint,
        }),
      ),
    );

    return this.client;
  }
}

export function configureLogger(config: LoggerConfig) {
  const sinks: LogSink[] = [];

  if (config.targets.includes('console')) {
    sinks.push(new ConsoleLogSink());
  }

  if (config.targets.includes('local')) {
    sinks.push(new LocalFileLogSink(config.localPath ?? './logs/backend.log'));
  }

  if (config.targets.includes('sls')) {
    if (!config.sls) {
      throw new Error('SLS logger configuration is required when LOG_TARGETS includes sls.');
    }

    sinks.push(new SlsLogSink(config.sls));
  }

  setLoggerSinks(sinks, {
    ...(config.maxPendingWrites === undefined ? {} : { maxPendingWrites: config.maxPendingWrites }),
    ...(config.writeTimeoutMs === undefined ? {} : { writeTimeoutMs: config.writeTimeoutMs }),
  });
}

function toSlsContents(record: LogRecord, LogContent: SlsRuntime['LogContent']) {
  const contents = [
    new LogContent({ key: 'timestamp', value: record.timestamp }),
    new LogContent({ key: 'level', value: record.level }),
    new LogContent({ key: 'message', value: record.message }),
  ];
  const data = formatLogRecordData(record);

  if (data) {
    contents.push(new LogContent({ key: 'data', value: data }));
  }

  return contents;
}

async function loadSlsRuntime(): Promise<SlsRuntime> {
  const [openApiModule, slsModule] = await Promise.all([
    import('@alicloud/openapi-core'),
    import('@alicloud/sls20201230'),
  ]);
  const typedSlsModule = slsModule as unknown as typeof import('@alicloud/sls20201230/dist/client');

  return {
    Client: typedSlsModule.default as unknown as SlsRuntime['Client'],
    LogContent: typedSlsModule.LogContent as unknown as SlsRuntime['LogContent'],
    LogGroup: typedSlsModule.LogGroup as unknown as SlsRuntime['LogGroup'],
    LogItem: typedSlsModule.LogItem as unknown as SlsRuntime['LogItem'],
    OpenApiUtil: openApiModule.$OpenApiUtil,
    PutLogsRequest: typedSlsModule.PutLogsRequest as unknown as SlsRuntime['PutLogsRequest'],
  };
}
