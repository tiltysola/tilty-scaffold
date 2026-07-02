import { type Dispatch, type SetStateAction } from 'react';
import { useIntl } from 'react-intl';

import { ChevronDownIcon } from 'lucide-react';

import { type PhoneCountryCode } from '@/lib/auth';
import { composePhoneNumber, getPhoneCountryCodeMessageId, getPhonePlaceholder } from '@/lib/phone';
import { type UserListItem } from '@/lib/users';
import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import FormMessage from '@/components/FormMessage';

import { type EditUserForm, formatVerifiedStateTooltip } from '../utils';
import { ToggleControl } from './ToggleControl';

interface AccountTabProps {
  editError: string | null;
  editingDisabled: boolean;
  editingForm: EditUserForm;
  editingUser: UserListItem | null;
  emailVerifiedDisabled: boolean;
  onFormChange: Dispatch<SetStateAction<EditUserForm>>;
  phoneBindingEnabled: boolean;
  phoneCountryCodes: PhoneCountryCode[];
  phoneDisabled: boolean;
  profileEmailVerificationEnabled: boolean;
  saving: boolean;
}

export function AccountTab({
  editError,
  editingDisabled,
  editingForm,
  editingUser,
  emailVerifiedDisabled,
  onFormChange,
  phoneBindingEnabled,
  phoneCountryCodes,
  phoneDisabled,
  profileEmailVerificationEnabled,
  saving,
}: AccountTabProps) {
  const intl = useIntl();

  return (
    <div className="grid gap-5 pt-2">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="editUsername">{intl.formatMessage({ id: 'auth.username' })}</Label>
          <Input
            autoComplete="username"
            disabled={saving}
            id="editUsername"
            onChange={(event) => onFormChange((current) => ({ ...current, username: event.target.value }))}
            placeholder={intl.formatMessage({ id: 'auth.username.placeholder' })}
            value={editingForm.username}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editDisplayName">{intl.formatMessage({ id: 'profile.display.name' })}</Label>
          <Input
            autoComplete="name"
            disabled={saving}
            id="editDisplayName"
            onChange={(event) => onFormChange((current) => ({ ...current, displayName: event.target.value }))}
            placeholder={intl.formatMessage({ id: 'profile.display.name.placeholder' })}
            value={editingForm.displayName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editEmail">{intl.formatMessage({ id: 'profile.email' })}</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Input
              autoComplete="email"
              disabled={editingDisabled}
              id="editEmail"
              onChange={(event) => {
                const email = event.target.value;

                onFormChange((current) => ({
                  ...current,
                  email,
                  emailVerified: editingUser && email === editingUser.email ? editingUser.emailVerified : false,
                }));
              }}
              placeholder={intl.formatMessage({ id: 'auth.email.placeholder' })}
              type="email"
              value={editingForm.email}
            />
            <ToggleControl
              checked={editingForm.emailVerified}
              disabled={emailVerifiedDisabled}
              label={intl.formatMessage({ id: 'users.edit.email.verified.label' })}
              onCheckedChange={(checked) => onFormChange((current) => ({ ...current, emailVerified: checked }))}
              showLabel={false}
              tooltip={formatVerifiedStateTooltip(
                intl,
                intl.formatMessage({ id: 'profile.email' }),
                editingForm.emailVerified,
                profileEmailVerificationEnabled
                  ? undefined
                  : intl.formatMessage({ id: 'users.edit.email.verification.not.configured' }),
              )}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editPhoneLocalNumber">{intl.formatMessage({ id: 'profile.phone' })}</Label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={phoneDisabled}>
                  <Button className="w-24 shrink-0 justify-between" type="button" variant="outline">
                    {editingForm.phoneCountryCode}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[60] min-w-56">
                  {phoneCountryCodes.map((countryCode) => (
                    <DropdownMenuItem
                      key={countryCode}
                      onSelect={() =>
                        onFormChange((current) => {
                          const phoneNumber = composePhoneNumber({
                            ...current,
                            phoneCountryCode: countryCode,
                          });

                          return {
                            ...current,
                            phoneCountryCode: countryCode,
                            phoneVerified:
                              editingUser && phoneNumber === (editingUser.phoneNumber ?? '')
                                ? editingUser.phoneVerified
                                : false,
                          };
                        })
                      }
                    >
                      {intl.formatMessage({ id: getPhoneCountryCodeMessageId(countryCode) })}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                autoComplete="tel-national"
                disabled={phoneDisabled}
                id="editPhoneLocalNumber"
                onChange={(event) => {
                  const phoneLocalNumber = event.target.value;

                  onFormChange((current) => {
                    const phoneNumber = composePhoneNumber({
                      ...current,
                      phoneLocalNumber,
                    });

                    return {
                      ...current,
                      phoneLocalNumber,
                      phoneVerified:
                        editingUser && phoneNumber === (editingUser.phoneNumber ?? '')
                          ? editingUser.phoneVerified
                          : false,
                    };
                  });
                }}
                placeholder={
                  phoneBindingEnabled
                    ? getPhonePlaceholder(editingForm.phoneCountryCode)
                    : intl.formatMessage({ id: 'common.not.configured' })
                }
                value={editingForm.phoneLocalNumber}
              />
            </div>
            <ToggleControl
              checked={editingForm.phoneVerified}
              disabled={phoneDisabled || !editingForm.phoneLocalNumber.trim()}
              label={intl.formatMessage({ id: 'users.edit.phone.verified.label' })}
              onCheckedChange={(checked) => onFormChange((current) => ({ ...current, phoneVerified: checked }))}
              showLabel={false}
              tooltip={formatVerifiedStateTooltip(
                intl,
                intl.formatMessage({ id: 'profile.phone' }),
                editingForm.phoneVerified,
                !phoneBindingEnabled
                  ? intl.formatMessage({ id: 'users.edit.sms.verification.not.configured' })
                  : editingForm.phoneLocalNumber.trim()
                    ? undefined
                    : intl.formatMessage({ id: 'users.edit.phone.verification.requires.phone' }),
              )}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="editPassword">{intl.formatMessage({ id: 'auth.password' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={editingDisabled}
            id="editPassword"
            onChange={(event) => onFormChange((current) => ({ ...current, password: event.target.value }))}
            placeholder={intl.formatMessage({ id: 'users.edit.password.placeholder' })}
            type="password"
            value={editingForm.password}
          />
        </div>
        <div className="grid gap-2">
          <Label>{intl.formatMessage({ id: 'users.edit.availability' })}</Label>
          <ToggleControl
            checked={editingForm.available}
            disabled={editingDisabled}
            label={intl.formatMessage({ id: editingForm.available ? 'users.available' : 'users.disabled' })}
            onCheckedChange={(checked) => onFormChange((current) => ({ ...current, available: checked }))}
            tooltip={intl.formatMessage({ id: editingForm.available ? 'users.available' : 'users.disabled' })}
          />
        </div>
      </div>
      <FormMessage message={editError} variant="error" />
    </div>
  );
}
