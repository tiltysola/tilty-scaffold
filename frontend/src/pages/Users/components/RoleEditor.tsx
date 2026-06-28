import { type RoleSummary } from '@/lib/users';
import { Checkbox } from '@/shadcn/components/ui/checkbox';
import { Label } from '@/shadcn/components/ui/label';

export function RoleEditor({
  disabled,
  onToggle,
  roles,
  selectedRoleKeys,
}: {
  disabled: boolean;
  onToggle: (roleKey: string, enabled: boolean) => void;
  roles: RoleSummary[];
  selectedRoleKeys: string[];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {roles.map((role) => {
        const inputId = `role-editor-${role.key}`;

        return (
          <div className="flex items-center gap-2 text-sm" key={role.key}>
            <Checkbox
              checked={selectedRoleKeys.includes(role.key)}
              disabled={disabled}
              id={inputId}
              onCheckedChange={(checked: boolean | 'indeterminate') => onToggle(role.key, checked === true)}
            />
            <Label className="font-normal" htmlFor={inputId}>
              {role.name}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
