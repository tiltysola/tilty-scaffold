import { useIntl } from 'react-intl';

import { type RoleSummary } from '@/lib/users';
import { Badge } from '@/shadcn/components/ui/badge';

import { ProfileSection } from '@/components/ProfileCardList';

import { resolveSelectedPermissionKeys } from '../utils';
import { RoleEditor } from './RoleEditor';

interface PermissionsTabProps {
  availableRoles: RoleSummary[];
  disabled: boolean;
  editingRoleKeys: string[];
  onRoleToggle: (roleKey: string, enabled: boolean) => void;
}

export function PermissionsTab({ availableRoles, disabled, editingRoleKeys, onRoleToggle }: PermissionsTabProps) {
  const intl = useIntl();
  const selectedPermissionKeys = resolveSelectedPermissionKeys(availableRoles, editingRoleKeys);

  return (
    <div className="grid gap-4 pt-2">
      <ProfileSection
        description={intl.formatMessage({ id: 'users.edit.roles.description' })}
        title={intl.formatMessage({ id: 'users.roles' })}
      >
        <div className="p-4">
          <RoleEditor
            disabled={disabled}
            onToggle={onRoleToggle}
            roles={availableRoles}
            selectedRoleKeys={editingRoleKeys}
          />
        </div>
      </ProfileSection>
      <ProfileSection
        description={intl.formatMessage({ id: 'users.edit.permissions.description' })}
        title={intl.formatMessage({ id: 'users.permissions' })}
      >
        <div className="p-4">
          {selectedPermissionKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedPermissionKeys.map((permissionKey) => (
                <Badge key={permissionKey} variant="outline">
                  {permissionKey}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{intl.formatMessage({ id: 'users.no.permissions' })}</span>
          )}
        </div>
      </ProfileSection>
    </div>
  );
}
