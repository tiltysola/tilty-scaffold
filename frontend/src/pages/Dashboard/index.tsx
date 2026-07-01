import { useIntl } from 'react-intl';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { getUserHandle } from '@/lib/auth';

const Index = () => {
  const intl = useIntl();
  const { user } = useAuthenticatedSession();
  const displayName = user.displayName ?? intl.formatMessage({ id: 'fallback.signed.in.user' });
  const username = getUserHandle(user.username);

  return (
    <div className="grid gap-4 p-4 lg:p-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-normal">
          {intl.formatMessage({ id: 'dashboard.welcome' }, { name: displayName })}
        </h1>
        <p className="text-sm text-muted-foreground">{username}</p>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{intl.formatMessage({ id: 'dashboard.description' })}</p>
    </div>
  );
};

export default Index;
