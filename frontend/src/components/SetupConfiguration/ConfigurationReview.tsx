import { type SetupAdministrator, type SetupEnvironment } from '@/lib/setup';
import { cn } from '@/shadcn/lib/utils';

import { setupSteps } from './definitions';
import { fieldGroupsNeedHeader, getFieldGroups } from './utils';

export function ConfigurationReview({
  administrator,
  environment,
  hasExistingUsers,
}: {
  administrator?: SetupAdministrator;
  environment: SetupEnvironment;
  hasExistingUsers?: boolean;
}) {
  const environmentSections = getEnvironmentReviewSections(environment);
  const administratorFields =
    administrator && !hasExistingUsers
      ? [
          { key: 'ADMIN_USERNAME', label: 'Administrator Username', value: administrator.username },
          { key: 'ADMIN_DISPLAY_NAME', label: 'Administrator Display Name', value: administrator.displayName },
          { key: 'ADMIN_EMAIL', label: 'Administrator Email', value: administrator.email },
          { key: 'ADMIN_PASSWORD', label: 'Administrator Password', value: administrator.password },
          {
            key: 'ADMIN_CONFIRM_PASSWORD',
            label: 'Confirm Administrator Password',
            value: administrator.confirmPassword,
          },
        ]
      : [];

  return (
    <div className="grid gap-6">
      {hasExistingUsers ? (
        <ReviewSection
          groups={[
            {
              fields: [
                {
                  key: 'ADMINISTRATOR',
                  label: 'Administrator',
                  value: 'Existing users retained',
                },
              ],
              name: 'General',
            },
          ]}
          title="Administrator"
        />
      ) : null}
      {administratorFields.length > 0 ? (
        <ReviewSection groups={[{ fields: administratorFields, name: 'General' }]} title="Administrator" />
      ) : null}
      {environmentSections.map((section) => (
        <ReviewSection groups={section.groups} key={section.title} title={section.title} />
      ))}
    </div>
  );
}

interface ReviewField {
  key: string;
  label: string;
  value: string;
}

interface ReviewFieldGroup {
  fields: ReviewField[];
  name: string;
}

interface ReviewSectionDefinition {
  groups: ReviewFieldGroup[];
  title: string;
}

function ReviewSection({ groups, title }: ReviewSectionDefinition) {
  return (
    <section className="grid min-w-0 gap-4 border-b border-border/45 pb-6 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid gap-5">
        {groups.map((group) => (
          <div className="grid min-w-0 gap-3" key={group.name}>
            {fieldGroupsNeedHeader(groups) ? (
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">{group.name}</h4>
            ) : null}
            <div className="grid min-w-0 gap-2">
              {group.fields.map((field) => (
                <ReviewFieldRow field={field} key={field.key} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewFieldRow({ field }: { field: ReviewField }) {
  const value = formatReviewValue(field.key, field.value);

  return (
    <div className="grid min-w-0 items-start gap-2 rounded-md border bg-card/70 p-3 lg:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)] lg:gap-4">
      <div className="grid min-w-0 self-start content-start gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{field.label}</span>
        </div>
        <code className="break-all text-xs text-muted-foreground">{field.key}</code>
      </div>
      <div className="min-w-0 self-center">
        {value.multiline ? (
          <pre
            className={cn(
              'max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/70 px-3 py-2 text-xs leading-5 ring-1 ring-border/25 supports-backdrop-filter:bg-muted/55',
              value.empty ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {value.text}
          </pre>
        ) : (
          <div
            className={cn(
              'break-all rounded-md bg-muted/70 px-3 py-2 text-sm ring-1 ring-border/25 supports-backdrop-filter:bg-muted/55',
              value.empty ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {value.text}
          </div>
        )}
      </div>
    </div>
  );
}

function getEnvironmentReviewSections(environment: SetupEnvironment): ReviewSectionDefinition[] {
  const knownKeys = new Set<string>();
  const sections: ReviewSectionDefinition[] = setupSteps.flatMap((step) => {
    if (!step.fields) {
      return [];
    }

    for (const field of step.fields) {
      knownKeys.add(field.key);
    }

    const groups = getFieldGroups(step.fields)
      .map((group) => ({
        name: group.name,
        fields: group.fields
          .filter((field) => !field.visible || field.visible(environment))
          .map((field) => ({
            key: field.key,
            label: field.label,
            value: environment[field.key] ?? '',
          })),
      }))
      .filter((group) => group.fields.length > 0);

    return groups.length > 0
      ? [
          {
            title: step.title,
            groups,
          },
        ]
      : [];
  });
  const additionalFields = Object.keys(environment)
    .filter((key) => !knownKeys.has(key))
    .sort()
    .map((key) => ({
      key,
      label: key,
      value: environment[key] ?? '',
    }));

  if (additionalFields.length > 0) {
    sections.push({
      title: 'Additional',
      groups: [
        {
          fields: additionalFields,
          name: 'General',
        },
      ],
    });
  }

  return sections;
}

function formatReviewValue(key: string, value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return {
      empty: true,
      multiline: false,
      text: 'Empty',
    };
  }

  if (isProfileEnvironmentKey(key)) {
    return {
      empty: false,
      multiline: true,
      text: formatProfileReviewValue(normalized),
    };
  }

  if (key === 'DATABASE_URL' || key === 'CACHE_REDIS_URL') {
    return {
      empty: false,
      multiline: normalized.length > 90,
      text: maskUrlValue(normalized),
    };
  }

  if (isSensitiveKey(key)) {
    return {
      empty: false,
      multiline: false,
      text: redactSecret(normalized),
    };
  }

  if (isCredentialIdentifierKey(key)) {
    return {
      empty: false,
      multiline: false,
      text: redactIdentifier(normalized),
    };
  }

  return {
    empty: false,
    multiline: normalized.length > 90 || normalized.includes('\n'),
    text: normalized,
  };
}

function formatProfileReviewValue(value: string) {
  try {
    return JSON.stringify(redactProfileValue(JSON.parse(value)), null, 2);
  } catch {
    return redactSecret(value);
  }
}

function redactProfileValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactProfileValue(item));
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (isSensitiveProfileKey(key)) {
        return redactSecret(value);
      }

      if (isCredentialIdentifierKey(key)) {
        return redactIdentifier(value);
      }

      if (isUrlReviewKey(key)) {
        return maskUrlValue(value);
      }
    }

    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactProfileValue(entryValue, entryKey)]),
  );
}

function redactSecret(value: string) {
  return `[redacted ${value.length} chars]`;
}

function redactIdentifier(value: string) {
  if (value.length <= 6) {
    return '[redacted]';
  }

  return `${value.slice(0, 2)}...[redacted]...${value.slice(-4)}`;
}

function maskUrlValue(value: string) {
  try {
    const url = new URL(value);

    if (url.username) {
      url.username = 'redacted';
    }

    if (url.password) {
      url.password = 'redacted';
    }

    for (const [key] of url.searchParams) {
      if (isSensitiveProfileKey(key)) {
        url.searchParams.set(key, 'redacted');
      }
    }

    return url.toString();
  } catch {
    return redactSecret(value);
  }
}

function isProfileEnvironmentKey(key: string) {
  return key === 'EMAIL_SMTP_PROFILES' || key === 'SMS_ALICLOUD_PROFILES' || key === 'SSO_PROFILES';
}

function isSensitiveKey(key: string) {
  return (
    key.endsWith('_SECRET') ||
    key.endsWith('_PASSWORD') ||
    key.endsWith('_ACCESS_KEY_SECRET') ||
    key === 'AUTH_TOKEN_SECRET' ||
    key === 'DATABASE_URL' ||
    key === 'CACHE_REDIS_URL' ||
    key === 'EMAIL_SMTP_PROFILES' ||
    key === 'SMS_ALICLOUD_PROFILES' ||
    key === 'SSO_PROFILES'
  );
}

function isSensitiveProfileKey(key: string) {
  const normalized = key.toLowerCase();

  return normalized.includes('secret') || normalized.includes('password') || normalized.endsWith('token');
}

function isCredentialIdentifierKey(key: string) {
  const normalized = key.toLowerCase();

  return normalized.endsWith('accesskeyid') || normalized.endsWith('access_key_id');
}

function isUrlReviewKey(key: string) {
  const normalized = key.toLowerCase();

  return normalized.endsWith('url') || normalized.endsWith('uri');
}
