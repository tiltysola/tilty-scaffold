import { useIntl } from 'react-intl';

import { type ApiKeySummary } from '@/lib/api-keys';
import { Badge } from '@/shadcn/components/ui/badge';

export function ApiKeyStatusBadge({ status }: { status: ApiKeySummary['status'] }) {
  const intl = useIntl();
  const variant = status === 'active' ? 'default' : status === 'revoked' ? 'destructive' : 'secondary';

  return <Badge variant={variant}>{intl.formatMessage({ id: `api.keys.status.${status}` })}</Badge>;
}
