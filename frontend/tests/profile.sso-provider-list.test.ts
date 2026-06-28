import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it, vi } from 'vitest';

import { SsoProviderList } from '../src/pages/Profile/components/SsoProviderList';

describe('profile SSO provider list', () => {
  it('uses generic provider descriptions instead of protocol names', () => {
    const markup = renderToStaticMarkup(
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
    );

    expect(markup).toContain('External sign-in provider');
    expect(markup).not.toContain('OpenID Connect');
    expect(markup).not.toContain('OAuth 2.0');
  });
});
