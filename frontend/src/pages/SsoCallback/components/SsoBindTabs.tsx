import { type ChangeEventHandler, type SubmitEventHandler } from 'react';
import { useIntl } from 'react-intl';

import { LinkIcon, UserPlusIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';

import FormMessage from '@/components/FormMessage';

import { type SsoBindState } from '../utils';

interface LoginFormState {
  identifier: string;
  password: string;
}

interface SsoCreateFormState {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export function SsoBindTabs({
  bindForm,
  createForm,
  error,
  onBindChange,
  onBindSubmit,
  onCreateChange,
  onCreateSubmit,
  onTabChange,
  ssoBind,
  submitting,
  tab,
}: {
  bindForm: LoginFormState;
  createForm: SsoCreateFormState;
  error?: string | null;
  onBindChange: (field: keyof LoginFormState) => ChangeEventHandler<HTMLInputElement>;
  onBindSubmit: SubmitEventHandler<HTMLFormElement>;
  onCreateChange: (field: keyof SsoCreateFormState) => ChangeEventHandler<HTMLInputElement>;
  onCreateSubmit: SubmitEventHandler<HTMLFormElement>;
  onTabChange: (value: string) => void;
  ssoBind: SsoBindState;
  submitting: boolean;
  tab: 'bind' | 'create';
}) {
  const intl = useIntl();

  return (
    <Tabs className="w-full" onValueChange={onTabChange} value={tab}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="create">{intl.formatMessage({ id: 'sso.new.account' })}</TabsTrigger>
        <TabsTrigger value="bind">{intl.formatMessage({ id: 'sso.existing.account' })}</TabsTrigger>
      </TabsList>
      <div className="mt-2">
        <FormMessage message={error} variant="error" />
      </div>
      <TabsContent className="mt-4" value="create">
        <form className="grid gap-4" onSubmit={onCreateSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-username">{intl.formatMessage({ id: 'auth.username' })}</Label>
            <Input
              autoComplete="username"
              disabled={submitting}
              id="sso-callback-username"
              name="username"
              onChange={onCreateChange('username')}
              placeholder={intl.formatMessage({ id: 'sso.username.placeholder' })}
              value={createForm.username}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-display-name">{intl.formatMessage({ id: 'auth.display.name' })}</Label>
            <Input
              autoComplete="name"
              disabled={submitting}
              id="sso-callback-display-name"
              name="displayName"
              onChange={onCreateChange('displayName')}
              placeholder={intl.formatMessage({ id: 'sso.display.name.placeholder' })}
              value={createForm.displayName}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-email">{intl.formatMessage({ id: 'auth.email' })}</Label>
            <Input
              autoComplete="email"
              id="sso-callback-email"
              name="email"
              placeholder={intl.formatMessage({ id: 'sso.email.placeholder' })}
              readOnly
              type="email"
              value={ssoBind.email}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-password">{intl.formatMessage({ id: 'auth.password' })}</Label>
            <Input
              autoComplete="new-password"
              disabled={submitting}
              id="sso-callback-password"
              name="password"
              onChange={onCreateChange('password')}
              placeholder={intl.formatMessage({ id: 'security.new.password.placeholder' })}
              type="password"
              value={createForm.password}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-confirm-password">{intl.formatMessage({ id: 'auth.password.confirm' })}</Label>
            <Input
              autoComplete="new-password"
              disabled={submitting}
              id="sso-callback-confirm-password"
              name="confirmPassword"
              onChange={onCreateChange('confirmPassword')}
              placeholder={intl.formatMessage({ id: 'security.confirm.password.placeholder' })}
              type="password"
              value={createForm.confirmPassword}
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            <UserPlusIcon />
            {submitting
              ? intl.formatMessage({ id: 'auth.processing' })
              : intl.formatMessage({ id: 'auth.create.new.account' })}
          </Button>
        </form>
      </TabsContent>
      <TabsContent className="mt-4" value="bind">
        <form className="grid gap-4" onSubmit={onBindSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-bind-identifier">{intl.formatMessage({ id: 'auth.email.or.username' })}</Label>
            <Input
              autoComplete="username"
              disabled={submitting}
              id="sso-callback-bind-identifier"
              name="identifier"
              onChange={onBindChange('identifier')}
              placeholder={intl.formatMessage({ id: 'auth.email.or.username.placeholder' })}
              value={bindForm.identifier}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sso-callback-bind-password">{intl.formatMessage({ id: 'auth.password' })}</Label>
            <Input
              autoComplete="current-password"
              disabled={submitting}
              id="sso-callback-bind-password"
              name="password"
              onChange={onBindChange('password')}
              placeholder={intl.formatMessage({ id: 'identity.enter.password.placeholder' })}
              type="password"
              value={bindForm.password}
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit" variant="outline">
            <LinkIcon />
            {submitting
              ? intl.formatMessage({ id: 'auth.processing' })
              : intl.formatMessage({ id: 'sso.bind.existing.account' })}
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
