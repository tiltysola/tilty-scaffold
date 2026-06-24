import {
  CalendarClockIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DatabaseZapIcon,
  FileTextIcon,
  HardDriveIcon,
  KeyRoundIcon,
  type LucideIcon,
  MailIcon,
  ServerIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UserPlusIcon,
} from 'lucide-react';

import { type SetupAdministrator, type SetupEnvironment } from '@/lib/setup';

type FieldKind = 'password' | 'select' | 'sms-profiles' | 'smtp-profiles' | 'sso-profiles' | 'textarea' | 'text';

export interface SetupFieldDefinition {
  description?: string;
  group?: string;
  key: string;
  kind?: FieldKind;
  label: string;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  visible?: (environment: SetupEnvironment) => boolean;
}

interface SetupStepDefinition {
  fields?: SetupFieldDefinition[];
  icon: LucideIcon;
  id: string;
  title: string;
}

interface FieldHelp {
  description: string;
  placeholder?: string;
}

export const administratorDefaults: SetupAdministrator = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const booleanOptions = [
  { label: 'Disabled', value: 'false' },
  { label: 'Enabled', value: 'true' },
];

export const setupFieldHelp: Record<string, FieldHelp> = {
  NODE_ENV: {
    description: 'Selects the backend runtime environment. Production mode enforces stricter security validation.',
  },
  SERVER_HOST: {
    description: 'Specifies the network interface on which the backend HTTP server listens.',
    placeholder: '0.0.0.0',
  },
  SERVER_PORT: {
    description: 'Specifies the port used by the backend HTTP server.',
    placeholder: '3000',
  },
  APP_DOMAIN: {
    description: 'Defines the primary public application origin used for browser access and callback URL defaults.',
    placeholder: 'https://app.example.com',
  },
  APP_CORS_ORIGINS: {
    description: 'Lists the browser origins permitted to access the backend API. Defaults to the application domain.',
    placeholder: 'https://app.example.com, http://localhost:8011',
  },
  SERVER_TRUST_PROXY: {
    description: 'Controls whether reverse proxy headers such as X-Forwarded-For and X-Forwarded-Proto are trusted.',
  },
  SERVER_MULTI_INSTANCE_ENABLED: {
    description: 'Enables deployment across multiple backend instances. Requires Redis, an external database, and OSS.',
  },
  DATABASE_DIALECT: {
    description: 'Selects the database engine used by the backend.',
  },
  DATABASE_STORAGE: {
    description: 'Specifies the SQLite database file path. Relative paths resolve from the backend working directory.',
    placeholder: './data/database.sqlite',
  },
  DATABASE_URL: {
    description: 'Specifies the PostgreSQL or MySQL connection string.',
    placeholder: 'postgres://app:password@db.example.com:5432/tilty',
  },
  DATABASE_SSL: {
    description: 'Enables TLS for MySQL or PostgreSQL database connections.',
  },
  DATABASE_CONNECT_TIMEOUT_MS: {
    description: 'Defines the maximum duration, in milliseconds, for database connection attempts.',
    placeholder: '10000',
  },
  DATABASE_POOL_MAX: {
    description: 'Specifies the maximum number of database connections maintained by the pool.',
    placeholder: '10',
  },
  DATABASE_POOL_MIN: {
    description: 'Specifies the minimum number of database connections maintained by the pool.',
    placeholder: '0',
  },
  DATABASE_POOL_ACQUIRE_MS: {
    description: 'Defines the maximum time a request may wait for a database connection from the pool.',
    placeholder: '30000',
  },
  DATABASE_POOL_IDLE_MS: {
    description: 'Defines how long an idle database connection remains in the pool.',
    placeholder: '10000',
  },
  DATABASE_SYNC: {
    description: 'Controls startup schema synchronization. This setting must remain disabled in production.',
  },
  CACHE_STORE: {
    description: 'Selects the cache backend. Redis is required for multi-instance deployments.',
  },
  CACHE_REDIS_URL: {
    description: 'Specifies the Redis endpoint used for caching, rate limiting, and distributed locks.',
    placeholder: 'redis://localhost:6379/0',
  },
  CACHE_REDIS_REQUEST_TIMEOUT_MS: {
    description: 'Defines the maximum Redis command duration before the request is considered failed.',
    placeholder: '10000',
  },
  FILE_STORAGE_DRIVER: {
    description: 'Selects the storage provider for uploaded files.',
  },
  FILE_UPLOAD_MAX_BYTES: {
    description: 'Defines the maximum accepted upload size in bytes.',
    placeholder: '2097152',
  },
  FILE_PUBLIC_BASE_URL: {
    description: 'Specifies the URL prefix used by clients to access locally stored files.',
    placeholder: '/uploads',
  },
  FILE_LOCAL_ROOT: {
    description: 'Specifies the server directory used for uploaded files when local storage is selected.',
    placeholder: './data/uploads',
  },
  FILE_OSS_ACCESS_KEY_ID: {
    description: 'Specifies the Alibaba Cloud access key ID authorized to write to the selected OSS bucket.',
    placeholder: 'oss-access-key-id',
  },
  FILE_OSS_ACCESS_KEY_SECRET: {
    description: 'Specifies the Alibaba Cloud access key secret associated with the OSS access key ID.',
    placeholder: 'oss-access-key-secret-value',
  },
  FILE_OSS_BUCKET: {
    description: 'Specifies the OSS bucket used to store uploaded files.',
    placeholder: 'tilty-uploads',
  },
  FILE_OSS_ENDPOINT: {
    description: 'Specifies the OSS endpoint for the bucket region.',
    placeholder: 'oss-cn-hangzhou.aliyuncs.com',
  },
  FILE_OSS_REGION: {
    description: 'Specifies the Alibaba Cloud region where the OSS bucket is located.',
    placeholder: 'oss-cn-hangzhou',
  },
  FILE_OSS_PUBLIC_BASE_URL: {
    description:
      'Specifies the public URL prefix for files served from OSS or a CDN. Leave empty to derive the URL from the bucket and endpoint.',
    placeholder: 'https://cdn.example.com/uploads',
  },
  SCHEDULER_ENABLED: {
    description: 'Controls whether scheduled backend jobs are registered during startup.',
  },
  SCHEDULER_LOCK_TTL_MS: {
    description:
      'Defines the distributed scheduler lock lifetime in milliseconds. Used for multi-instance deployments.',
    placeholder: '300000',
  },
  AUTH_TOKEN_SECRET: {
    description: 'Defines the private signing secret for authentication tokens. Preserve this value after setup.',
    placeholder: 'Generated automatically',
  },
  AUTH_ACCESS_TOKEN_TTL_SECONDS: {
    description: 'Defines the validity period, in seconds, for access tokens.',
    placeholder: '900',
  },
  AUTH_REFRESH_TOKEN_TTL_SECONDS: {
    description: 'Defines the validity period, in seconds, for refresh tokens.',
    placeholder: '2592000',
  },
  AUTH_ACCESS_TOKEN_COOKIE_NAME: {
    description: 'Specifies the browser cookie name used for access tokens.',
    placeholder: 'tilty_scaffold_access_token',
  },
  AUTH_REFRESH_TOKEN_COOKIE_NAME: {
    description: 'Specifies the browser cookie name used for refresh tokens.',
    placeholder: 'tilty_scaffold_refresh_token',
  },
  AUTH_COOKIE_SAME_SITE: {
    description: 'Defines the SameSite policy applied to authentication cookies.',
  },
  AUTH_COOKIE_SECURE: {
    description: 'Controls whether authentication cookies are transmitted only over HTTPS.',
  },
  AUTH_RATE_LIMIT_WINDOW_MS: {
    description: 'Defines the rate limit window, in milliseconds, for authentication endpoints.',
    placeholder: '60000',
  },
  AUTH_RATE_LIMIT_MAX: {
    description: 'Specifies the maximum number of authentication requests allowed per rate limit window.',
    placeholder: '10',
  },
  GLOBAL_RATE_LIMIT_WINDOW_MS: {
    description: 'Defines the global rate limit window in milliseconds.',
    placeholder: '60000',
  },
  GLOBAL_RATE_LIMIT_MAX: {
    description: 'Specifies the maximum number of API requests allowed per global rate limit window.',
    placeholder: '1000',
  },
  LOG_REQUEST_ENABLED: {
    description: 'Enables access logging for backend HTTP requests.',
  },
  LOG_TARGETS: {
    description: 'Selects the destinations used for backend log output.',
  },
  LOG_PENDING_WRITE_MAX: {
    description: 'Defines the maximum number of pending asynchronous log writes before new writes are discarded.',
    placeholder: '1000',
  },
  LOG_WRITE_TIMEOUT_MS: {
    description: 'Defines the maximum duration, in milliseconds, allowed for each log write operation.',
    placeholder: '5000',
  },
  LOG_LOCAL_PATH: {
    description: 'Specifies the file path used when local file logging is enabled.',
    placeholder: './logs/backend.log',
  },
  LOG_SLS_ENDPOINT: {
    description: 'Specifies the Simple Log Service endpoint for the project region.',
    placeholder: 'cn-hangzhou.log.aliyuncs.com',
  },
  LOG_SLS_PROJECT: {
    description: 'Specifies the SLS project that owns the target Logstore.',
    placeholder: 'tilty-production',
  },
  LOG_SLS_LOGSTORE: {
    description: 'Specifies the SLS Logstore that receives backend log records.',
    placeholder: 'backend-logs',
  },
  LOG_SLS_ACCESS_KEY_ID: {
    description: 'Specifies the Alibaba Cloud access key ID authorized to write logs to SLS.',
    placeholder: 'sls-access-key-id',
  },
  LOG_SLS_ACCESS_KEY_SECRET: {
    description: 'Specifies the Alibaba Cloud access key secret used for SLS logging.',
    placeholder: 'sls-access-key-secret-value',
  },
  LOG_SLS_TOPIC: {
    description: 'Defines the topic value attached to SLS log records.',
    placeholder: 'tilty-scaffold',
  },
  LOG_SLS_SOURCE: {
    description: 'Defines the source value attached to SLS log records.',
    placeholder: 'backend',
  },
  EMAIL_VERIFICATION_SERVICE: {
    description: 'Selects the email delivery provider used for verification and password recovery workflows.',
  },
  EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: {
    description: 'Defines the validity period, in milliseconds, for email verification codes.',
    placeholder: '600000',
  },
  EMAIL_VERIFICATION_CODE_COOLDOWN_MS: {
    description: 'Defines the minimum interval before another verification email may be requested.',
    placeholder: '60000',
  },
  EMAIL_SMTP_PROFILES: {
    description: 'Configures SMTP delivery profiles. At least one profile is required when SMTP is enabled.',
  },
  SMS_VERIFICATION_SERVICE: {
    description: 'Selects the SMS delivery provider used for phone verification workflows.',
  },
  SMS_VERIFICATION_CODE_EXPIRES_IN_MS: {
    description: 'Defines the validity period, in milliseconds, for SMS verification codes.',
    placeholder: '600000',
  },
  SMS_VERIFICATION_CODE_COOLDOWN_MS: {
    description: 'Defines the minimum interval before another SMS verification code may be requested.',
    placeholder: '60000',
  },
  SMS_ALICLOUD_PROFILES: {
    description:
      'Configures Aliyun SMS profiles by phone country code. Configure only country codes supported for phone verification.',
  },
  SSO_ENABLED: {
    description: 'Enables third-party identity provider configuration and account binding.',
  },
  SSO_PROFILES: {
    description: 'Configures OAuth 2.0 and OpenID Connect providers as JSON profile objects.',
  },
};

export const administratorFieldHelp: Record<keyof SetupAdministrator, FieldHelp> = {
  username: {
    description: 'Specifies the unique username used by the root administrator to log in.',
    placeholder: 'root_admin',
  },
  displayName: {
    description: 'Specifies the display name shown for the root administrator account.',
    placeholder: 'Root Administrator',
  },
  email: {
    description: 'Specifies the email address assigned to the root administrator account.',
    placeholder: 'admin@example.com',
  },
  password: {
    description: 'Defines the initial password for the root administrator account. Use at least 8 characters.',
    placeholder: 'Enter an administrator password',
  },
  confirmPassword: {
    description: 'Re-enter the administrator password for confirmation.',
    placeholder: 'Confirm the administrator password',
  },
};

export const setupSteps: SetupStepDefinition[] = [
  {
    id: 'runtime',
    title: 'Runtime',
    icon: ServerIcon,
    fields: [
      {
        key: 'NODE_ENV',
        group: 'Server',
        label: 'Environment',
        kind: 'select',
        options: [
          { label: 'Development', value: 'development' },
          { label: 'Test', value: 'test' },
          { label: 'Production', value: 'production' },
        ],
      },
      { key: 'SERVER_HOST', group: 'Server', label: 'Server Host' },
      { key: 'SERVER_PORT', group: 'Server', label: 'Server Port' },
      { key: 'APP_DOMAIN', group: 'Application', label: 'Application Domain' },
      { key: 'APP_CORS_ORIGINS', group: 'Application', label: 'CORS Origins', kind: 'textarea' },
      {
        key: 'SERVER_TRUST_PROXY',
        group: 'Deployment',
        label: 'Trusted Proxy Headers',
        kind: 'select',
        options: booleanOptions,
      },
      {
        key: 'SERVER_MULTI_INSTANCE_ENABLED',
        group: 'Deployment',
        label: 'Multi-Instance Deployment',
        kind: 'select',
        options: booleanOptions,
      },
    ],
  },
  {
    id: 'database',
    title: 'Database',
    icon: DatabaseIcon,
    fields: [
      {
        key: 'DATABASE_DIALECT',
        group: 'Engine',
        label: 'Database Engine',
        kind: 'select',
        options: [
          { label: 'SQLite', value: 'sqlite' },
          { label: 'MySQL', value: 'mysql' },
          { label: 'PostgreSQL', value: 'postgres' },
        ],
      },
      {
        key: 'DATABASE_STORAGE',
        group: 'SQLite',
        label: 'SQLite File',
        visible: (environment) => environment.DATABASE_DIALECT === 'sqlite',
      },
      {
        key: 'DATABASE_URL',
        group: 'External Database',
        label: 'Connection URL',
        kind: 'password',
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_SSL',
        group: 'External Database',
        label: 'Database TLS',
        kind: 'select',
        options: booleanOptions,
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_CONNECT_TIMEOUT_MS',
        group: 'External Database',
        label: 'Connection Timeout (ms)',
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_POOL_MAX',
        group: 'Connection Pool',
        label: 'Maximum Pool Size',
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_POOL_MIN',
        group: 'Connection Pool',
        label: 'Minimum Pool Size',
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_POOL_ACQUIRE_MS',
        group: 'Connection Pool',
        label: 'Pool Acquire Timeout (ms)',
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_POOL_IDLE_MS',
        group: 'Connection Pool',
        label: 'Pool Idle Timeout (ms)',
        visible: (environment) => environment.DATABASE_DIALECT !== 'sqlite',
      },
      {
        key: 'DATABASE_SYNC',
        group: 'Schema',
        label: 'Startup Schema Synchronization',
        kind: 'select',
        options: [
          { label: 'Disabled', value: 'off' },
          { label: 'Alter Existing Schema', value: 'alter' },
          { label: 'Recreate Schema', value: 'force' },
        ],
      },
    ],
  },
  {
    id: 'cache',
    title: 'Cache',
    icon: DatabaseZapIcon,
    fields: [
      {
        key: 'CACHE_STORE',
        group: 'Store',
        label: 'Cache Store',
        kind: 'select',
        options: [
          { label: 'Memory', value: 'memory' },
          { label: 'Redis', value: 'redis' },
        ],
      },
      {
        key: 'CACHE_REDIS_URL',
        group: 'Redis',
        label: 'Redis URL',
        kind: 'password',
        visible: (environment) => environment.CACHE_STORE === 'redis',
      },
      {
        key: 'CACHE_REDIS_REQUEST_TIMEOUT_MS',
        group: 'Redis',
        label: 'Redis Request Timeout (ms)',
        visible: (environment) => environment.CACHE_STORE === 'redis',
      },
    ],
  },
  {
    id: 'file-storage',
    title: 'File Storage',
    icon: HardDriveIcon,
    fields: [
      {
        key: 'FILE_STORAGE_DRIVER',
        group: 'Driver',
        label: 'Storage Provider',
        kind: 'select',
        options: [
          { label: 'Local', value: 'local' },
          { label: 'OSS', value: 'oss' },
        ],
      },
      { key: 'FILE_UPLOAD_MAX_BYTES', group: 'Driver', label: 'Maximum Upload Size (bytes)' },
      {
        key: 'FILE_PUBLIC_BASE_URL',
        group: 'Local',
        label: 'Local Public URL Base',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'local',
      },
      {
        key: 'FILE_LOCAL_ROOT',
        group: 'Local',
        label: 'Local File Root',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'local',
      },
      {
        key: 'FILE_OSS_ACCESS_KEY_ID',
        group: 'OSS',
        label: 'OSS Access Key ID',
        kind: 'password',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'oss',
      },
      {
        key: 'FILE_OSS_ACCESS_KEY_SECRET',
        group: 'OSS',
        label: 'OSS Access Key Secret',
        kind: 'password',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'oss',
      },
      {
        key: 'FILE_OSS_BUCKET',
        group: 'OSS',
        label: 'OSS Bucket',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'oss',
      },
      {
        key: 'FILE_OSS_ENDPOINT',
        group: 'OSS',
        label: 'OSS Endpoint',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'oss',
      },
      {
        key: 'FILE_OSS_REGION',
        group: 'OSS',
        label: 'OSS Region',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'oss',
      },
      {
        key: 'FILE_OSS_PUBLIC_BASE_URL',
        group: 'OSS',
        label: 'OSS Public URL Base',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === 'oss',
      },
    ],
  },
  {
    id: 'scheduler',
    title: 'Scheduler',
    icon: CalendarClockIcon,
    fields: [
      {
        key: 'SCHEDULER_ENABLED',
        group: 'Scheduler',
        label: 'Scheduler Status',
        kind: 'select',
        options: booleanOptions,
      },
      { key: 'SCHEDULER_LOCK_TTL_MS', group: 'Distributed Lock', label: 'Scheduler Lock TTL (ms)' },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    icon: ShieldCheckIcon,
    fields: [
      { key: 'AUTH_TOKEN_SECRET', group: 'Tokens', label: 'Token Signing Secret', kind: 'password' },
      { key: 'AUTH_ACCESS_TOKEN_TTL_SECONDS', group: 'Tokens', label: 'Access Token TTL (seconds)' },
      { key: 'AUTH_REFRESH_TOKEN_TTL_SECONDS', group: 'Tokens', label: 'Refresh Token TTL (seconds)' },
      { key: 'AUTH_ACCESS_TOKEN_COOKIE_NAME', group: 'Cookies', label: 'Access Token Cookie Name' },
      { key: 'AUTH_REFRESH_TOKEN_COOKIE_NAME', group: 'Cookies', label: 'Refresh Token Cookie Name' },
      {
        key: 'AUTH_COOKIE_SAME_SITE',
        group: 'Cookies',
        label: 'Cookie SameSite Policy',
        kind: 'select',
        options: [
          { label: 'Lax', value: 'lax' },
          { label: 'Strict', value: 'strict' },
          { label: 'None', value: 'none' },
        ],
      },
      {
        key: 'AUTH_COOKIE_SECURE',
        group: 'Cookies',
        label: 'Secure Cookies',
        kind: 'select',
        options: [
          { label: 'Automatic', value: 'auto' },
          { label: 'Enabled', value: 'true' },
          { label: 'Disabled', value: 'false' },
        ],
      },
      { key: 'AUTH_RATE_LIMIT_WINDOW_MS', group: 'Rate Limits', label: 'Authentication Rate Window (ms)' },
      { key: 'AUTH_RATE_LIMIT_MAX', group: 'Rate Limits', label: 'Authentication Rate Limit' },
      { key: 'GLOBAL_RATE_LIMIT_WINDOW_MS', group: 'Rate Limits', label: 'Global Rate Window (ms)' },
      { key: 'GLOBAL_RATE_LIMIT_MAX', group: 'Rate Limits', label: 'Global Rate Limit' },
    ],
  },
  {
    id: 'logging',
    title: 'Logging',
    icon: FileTextIcon,
    fields: [
      {
        key: 'LOG_REQUEST_ENABLED',
        group: 'General',
        label: 'Request Logging',
        kind: 'select',
        options: booleanOptions,
      },
      {
        key: 'LOG_TARGETS',
        group: 'General',
        label: 'Log Targets',
        kind: 'select',
        options: [
          { label: 'Console', value: 'console' },
          { label: 'Console + Local File', value: 'console,local' },
          { label: 'Console + SLS', value: 'console,sls' },
          { label: 'Console + Local File + SLS', value: 'console,local,sls' },
          { label: 'Local File', value: 'local' },
          { label: 'SLS', value: 'sls' },
        ],
      },
      { key: 'LOG_PENDING_WRITE_MAX', group: 'Write Behavior', label: 'Maximum Pending Writes' },
      { key: 'LOG_WRITE_TIMEOUT_MS', group: 'Write Behavior', label: 'Write Timeout (ms)' },
      {
        key: 'LOG_LOCAL_PATH',
        group: 'Local',
        label: 'Local Log Path',
        visible: (environment) => hasLogTarget(environment, 'local'),
      },
      {
        key: 'LOG_SLS_ENDPOINT',
        group: 'SLS',
        label: 'SLS Endpoint',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
      {
        key: 'LOG_SLS_PROJECT',
        group: 'SLS',
        label: 'SLS Project',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
      {
        key: 'LOG_SLS_LOGSTORE',
        group: 'SLS',
        label: 'SLS Logstore',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
      {
        key: 'LOG_SLS_ACCESS_KEY_ID',
        group: 'SLS',
        label: 'SLS Access Key ID',
        kind: 'password',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
      {
        key: 'LOG_SLS_ACCESS_KEY_SECRET',
        group: 'SLS',
        label: 'SLS Access Key Secret',
        kind: 'password',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
      {
        key: 'LOG_SLS_TOPIC',
        group: 'SLS',
        label: 'SLS Topic',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
      {
        key: 'LOG_SLS_SOURCE',
        group: 'SLS',
        label: 'SLS Source',
        visible: (environment) => hasLogTarget(environment, 'sls'),
      },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    icon: MailIcon,
    fields: [
      {
        key: 'EMAIL_VERIFICATION_SERVICE',
        group: 'Verification',
        label: 'Email Verification Provider',
        kind: 'select',
        options: [
          { label: 'Disabled', value: 'off' },
          { label: 'SMTP', value: 'smtp' },
        ],
      },
      {
        key: 'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
        group: 'Verification Codes',
        label: 'Verification Code Expiration (ms)',
        visible: (environment) => environment.EMAIL_VERIFICATION_SERVICE === 'smtp',
      },
      {
        key: 'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
        group: 'Verification Codes',
        label: 'Verification Code Cooldown (ms)',
        visible: (environment) => environment.EMAIL_VERIFICATION_SERVICE === 'smtp',
      },
      {
        key: 'EMAIL_SMTP_PROFILES',
        group: 'SMTP',
        label: 'SMTP Profiles',
        kind: 'smtp-profiles',
        visible: (environment) => environment.EMAIL_VERIFICATION_SERVICE === 'smtp',
      },
    ],
  },
  {
    id: 'sms',
    title: 'SMS',
    icon: SmartphoneIcon,
    fields: [
      {
        key: 'SMS_VERIFICATION_SERVICE',
        group: 'Verification',
        label: 'SMS Verification Provider',
        kind: 'select',
        options: [
          { label: 'Disabled', value: 'off' },
          { label: 'Aliyun SMS', value: 'aliyun' },
        ],
      },
      {
        key: 'SMS_VERIFICATION_CODE_EXPIRES_IN_MS',
        group: 'Verification Codes',
        label: 'Verification Code Expiration (ms)',
        visible: (environment) => environment.SMS_VERIFICATION_SERVICE === 'aliyun',
      },
      {
        key: 'SMS_VERIFICATION_CODE_COOLDOWN_MS',
        group: 'Verification Codes',
        label: 'Verification Code Cooldown (ms)',
        visible: (environment) => environment.SMS_VERIFICATION_SERVICE === 'aliyun',
      },
      {
        key: 'SMS_ALICLOUD_PROFILES',
        group: 'Aliyun SMS',
        label: 'Aliyun SMS Profiles',
        kind: 'sms-profiles',
        visible: (environment) => environment.SMS_VERIFICATION_SERVICE === 'aliyun',
      },
    ],
  },
  {
    id: 'sso',
    title: 'SSO',
    icon: KeyRoundIcon,
    fields: [
      { key: 'SSO_ENABLED', group: 'General', label: 'SSO Authentication', kind: 'select', options: booleanOptions },
      {
        key: 'SSO_PROFILES',
        group: 'Providers',
        label: 'SSO Profiles',
        kind: 'sso-profiles',
        visible: (environment) => environment.SSO_ENABLED === 'true',
      },
    ],
  },
  {
    id: 'administrator',
    title: 'Administrator',
    icon: UserPlusIcon,
  },
  {
    id: 'review',
    title: 'Review',
    icon: CheckCircle2Icon,
  },
];

export function hasLogTarget(environment: SetupEnvironment, target: string) {
  return environment.LOG_TARGETS?.split(',').some((item) => item.trim() === target) ?? false;
}
