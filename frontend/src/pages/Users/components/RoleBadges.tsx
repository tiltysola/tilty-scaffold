import { useIntl } from 'react-intl';

import { type RoleSummary } from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';

export function RoleBadges({ roleKeys, roles }: { roleKeys: string[]; roles: RoleSummary[] }) {
  const intl = useIntl();

  if (!roleKeys.length) {
    return <span className="text-sm text-muted-foreground/70">{intl.formatMessage({ id: 'profile.no.roles' })}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {roleKeys.map((roleKey) => {
        const permissions = roles.find((role) => role.key === roleKey)?.permissionKeys ?? [];

        return (
          <Tooltip key={roleKey}>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={0}>
                <Badge variant="outline">{roleKey}</Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {permissions.length ? permissions.join(', ') : intl.formatMessage({ id: 'profile.no.permissions' })}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
