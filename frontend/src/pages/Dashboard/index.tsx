import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';

import { AlertTriangleIcon, InfoIcon } from 'lucide-react';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { fetchMfaSettings, getUserHandle, type MfaSettings } from '@/lib/auth';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';

import { getDashboardAccountAlerts } from './utils';

interface MfaSettingsState {
  key: string;
  settings: MfaSettings;
}

interface MfaSettingsKeyUser {
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  totpEnabled: boolean;
  username: string;
}

const Index = () => {
  const [mfaSettingsState, setMfaSettingsState] = useState<MfaSettingsState | null>(null);
  const intl = useIntl();
  const { user } = useAuthenticatedSession();
  const displayName = user.displayName ?? intl.formatMessage({ id: 'fallback.signed.in.user' });
  const username = getUserHandle(user.username);
  const mfaSettingsKey = getMfaSettingsKey(user);
  const mfaSettings = mfaSettingsState?.key === mfaSettingsKey ? mfaSettingsState.settings : null;
  const accountAlerts = getDashboardAccountAlerts(user, mfaSettings);

  useEffect(() => {
    let isActive = true;

    void fetchMfaSettings()
      .then((settings) => {
        if (isActive) {
          setMfaSettingsState({
            key: mfaSettingsKey,
            settings,
          });
        }
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [mfaSettingsKey]);

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">
          {intl.formatMessage({ id: 'dashboard.welcome' }, { name: displayName })}
        </h1>
        <p className="text-sm text-muted-foreground">{username}</p>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{intl.formatMessage({ id: 'dashboard.description' })}</p>
      {accountAlerts.length > 0 ? (
        <div className="grid gap-2">
          {accountAlerts.map((alert) => {
            const Icon = alert.priority === 'warn' ? AlertTriangleIcon : InfoIcon;

            return (
              <Alert key={alert.id} variant={alert.priority === 'warn' ? 'destructive' : 'default'}>
                <Icon />
                <AlertTitle>{intl.formatMessage({ id: alert.titleMessageId })}</AlertTitle>
                <AlertDescription>{intl.formatMessage({ id: alert.descriptionMessageId })}</AlertDescription>
                <AlertAction className="top-1/2 -translate-y-1/2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={alert.actionTo}>{intl.formatMessage({ id: alert.actionMessageId })}</Link>
                  </Button>
                </AlertAction>
              </Alert>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default Index;

function getMfaSettingsKey(user: MfaSettingsKeyUser) {
  return [
    user.username,
    user.emailVerified ? 'email-verified' : 'email-unverified',
    user.phoneNumber ?? 'phone-missing',
    user.phoneVerified ? 'phone-verified' : 'phone-unverified',
    user.totpEnabled ? 'totp-enabled' : 'totp-disabled',
  ].join(':');
}
