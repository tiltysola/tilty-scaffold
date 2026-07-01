import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntlProvider } from 'react-intl';

import { describe, expect, it, vi } from 'vitest';

import { defaultMessages } from '../src/i18n';
import zhCNMessages from '../src/i18n/messages/zh-CN';
import { SsoProviderList } from '../src/pages/Profile/components/SsoProviderList';

describe('profile SSO provider list', () => {
  it('uses generic provider descriptions instead of protocol names', () => {
    const markup = renderToStaticMarkup(
      createElement(
        IntlProvider,
        {
          locale: 'en-US',
          messages: defaultMessages,
        },
        createElement(SsoProviderList, {
          identities: [],
          onBind: vi.fn(),
          providers: [
            {
              id: 'oidc-provider',
              name: 'OIDC Provider',
              protocol: 'oidc',
              loginEnabled: true,
              bindingEnabled: true,
            },
            {
              id: 'oauth-provider',
              name: 'OAuth Provider',
              protocol: 'oauth2',
              loginEnabled: true,
              bindingEnabled: true,
            },
          ],
        }),
      ),
    );

    expect(markup).toContain('External sign-in provider');
    expect(markup).not.toContain('OpenID Connect');
    expect(markup).not.toContain('OAuth 2.0');
  });

  it('uses localized provider descriptions', () => {
    const markup = renderToStaticMarkup(
      createElement(
        IntlProvider,
        {
          locale: 'zh-CN',
          messages: zhCNMessages,
        },
        createElement(SsoProviderList, {
          identities: [
            {
              email: 'linked@example.com',
              providerId: 'linked-provider',
              providerName: 'Linked Provider',
            },
          ],
          onBind: vi.fn(),
          providers: [
            {
              id: 'linked-provider',
              name: 'Linked Provider',
              protocol: 'oidc',
              loginEnabled: true,
              bindingEnabled: true,
            },
            {
              id: 'unlinked-provider',
              name: 'Unlinked Provider',
              protocol: 'oauth2',
              loginEnabled: true,
              bindingEnabled: true,
            },
          ],
        }),
      ),
    );

    expect(markup).toContain('已绑定为 linked@example.com');
    expect(markup).toContain('外部登录提供方');
    expect(markup).not.toContain('External sign-in provider');
    expect(markup).not.toContain('OpenID Connect');
    expect(markup).not.toContain('OAuth 2.0');
  });
});
