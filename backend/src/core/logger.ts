import { withTimeout } from './async';

type LogArg = string | number | boolean | null | undefined | object | Error;
type LogLevel = 'debug' | 'error' | 'info' | 'warn';

export interface LogRecord {
  args: RedactedLogArg[];
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface LogSink {
  flush?: () => Promise<void>;
  write: (record: LogRecord) => Promise<void> | void;
}

interface SerializedError {
  message: string;
  name: string;
  stack?: string;
}

interface LoggerSinkOptions {
  maxPendingWrites?: number;
  writeTimeoutMs?: number;
}

type RedactedLogArg = boolean | null | number | string | object | undefined;
type SerializedLogArg = boolean | null | number | string | SerializedError;

const pendingWrites = new Set<Promise<void>>();
let maxPendingWrites = 1000;
let sinks: LogSink[];
let writeTimeoutMs = 5000;

const redactedValue = '[REDACTED]';
const sensitiveAssignmentPattern =
  /\b((?:password|passwd|secret|token|api[-_]?key|access[-_]?key|client[-_]?secret|private[-_]?key)\s*[=:]\s*)[^,\s;]+/gi;
const authorizationHeaderPattern = /\b(bearer|basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
const sensitiveKeyFragments = [
  'accesskey',
  'apikey',
  'authorization',
  'clientsecret',
  'cookie',
  'passwd',
  'password',
  'privatekey',
  'secret',
  'setcookie',
  'token',
];

const consoleLogSink: LogSink = {
  write(record) {
    const prefix = `[${record.timestamp}] ${record.level.toUpperCase()}`;
    const method = record.level === 'debug' ? console.debug : console[record.level];

    method(prefix, ...record.args);
  },
};

sinks = [consoleLogSink];

export const logger = {
  debug: (...args: LogArg[]) => write('debug', args),
  error: (...args: LogArg[]) => write('error', args),
  info: (...args: LogArg[]) => write('info', args),
  warn: (...args: LogArg[]) => write('warn', args),
};

export function setLoggerSinks(nextSinks: LogSink[], options: LoggerSinkOptions = {}) {
  maxPendingWrites = options.maxPendingWrites ?? 1000;
  writeTimeoutMs = options.writeTimeoutMs ?? 5000;
  sinks = nextSinks.length > 0 ? nextSinks : [consoleLogSink];
}

export async function flushLogger() {
  await Promise.allSettled([...pendingWrites]);
  await Promise.allSettled(sinks.map((sink) => sink.flush?.()).filter(isPromise));
}

export function formatLogRecordAsJsonLine(record: LogRecord) {
  return JSON.stringify({
    args: record.args.map(serializeArg),
    level: record.level,
    message: record.message,
    timestamp: record.timestamp,
  });
}

export function formatLogRecordData(record: LogRecord) {
  return record.args.slice(1).map(stringifyArg).filter(Boolean).join(' ');
}

function write(level: LogLevel, args: LogArg[]) {
  const redactedArgs = args.map((arg) => redactArg(arg));
  const record: LogRecord = {
    args: redactedArgs,
    level,
    message: formatMessage(redactedArgs),
    timestamp: new Date().toISOString(),
  };

  for (const sink of sinks) {
    trackWrite(sink.write(record));
  }
}

function trackWrite(result: Promise<void> | void) {
  if (!isPromise(result)) {
    return;
  }

  if (pendingWrites.size >= maxPendingWrites) {
    console.error(
      `[${new Date().toISOString()}] ERROR`,
      'Logger sink write was dropped because the pending queue is full.',
    );
    return;
  }

  const pending = withTimeout(result, writeTimeoutMs, () => new Error('Logger sink write timed out.'))
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

function formatMessage(args: RedactedLogArg[]) {
  if (typeof args[0] === 'string') {
    return args[0];
  }

  return args.map(stringifyArg).join(' ');
}

function serializeArg(arg: RedactedLogArg): SerializedLogArg {
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

function stringifyArg(arg: RedactedLogArg): string {
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

function redactArg(arg: LogArg): RedactedLogArg {
  return redactUnknown(arg, new WeakSet<object>()) as RedactedLogArg;
}

function redactUnknown(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: redactText(value.message),
      name: value.name,
      ...(value.stack ? { stack: redactText(value.stack) } : {}),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (ArrayBuffer.isView(value)) {
    return `[Binary ${(value as ArrayBufferView).byteLength} bytes]`;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? redactedValue : redactUnknown(item, seen)]),
  );
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');

  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}

function redactText(value: string) {
  return value
    .replace(authorizationHeaderPattern, (_, scheme: string) => `${scheme} ${redactedValue}`)
    .replace(sensitiveAssignmentPattern, (_, prefix: string) => `${prefix}${redactedValue}`);
}
