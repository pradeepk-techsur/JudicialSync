import { GridContainer } from '@trussworks/react-uswds';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { authControllerLogin } from '../api/client';
import { useAuth } from './AuthProvider';

/**
 * Handles the IdP redirect back from Keycloak.
 *
 * It takes the authorization code (and every other query parameter the IdP
 * returned — an `iss` parameter under RFC 9207 must be forwarded, see plan
 * 01-06) and posts them to `POST /api/v1/auth/login`, where the server
 * validates the single-use `state` and the PKCE verifier it holds. The browser
 * never holds the client secret. On success it stores the session and navigates
 * to the first screen.
 */
interface LoginResponse {
  session_token: string;
}

export function CallbackPage(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invoke: the code is single-use.
    if (exchanged.current) {
      return;
    }
    exchanged.current = true;

    const code = params.get('code');
    const state = params.get('state') ?? window.sessionStorage.getItem('judicialsync.oidc_state');

    if (code === null) {
      setError('Sign-in did not complete. No authorization code was returned.');
      return;
    }

    // Forward every callback parameter verbatim (RFC 9207 iss validation).
    const callbackParams: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      callbackParams[key] = value;
    }

    void (async () => {
      const { data, error: loginError } = await authControllerLogin({
        body: {
          identity_assertion: code,
          state: state ?? undefined,
          callback_params: callbackParams,
        } as never,
      });
      if (loginError !== undefined || data === undefined) {
        setError('Sign-in could not be completed. Please try again.');
        return;
      }
      const payload = data as LoginResponse;
      window.sessionStorage.removeItem('judicialsync.oidc_state');
      setSession(payload.session_token);
      navigate('/', { replace: true });
    })();
  }, [params, navigate, setSession]);

  return (
    <main id="main-content">
      <GridContainer>
        {error !== null ? (
          <p className="usa-error-message" role="alert">
            {error}
          </p>
        ) : (
          <p>Completing sign-in…</p>
        )}
      </GridContainer>
    </main>
  );
}
