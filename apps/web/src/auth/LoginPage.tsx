import { Button, GridContainer } from '@trussworks/react-uswds';
import { useState } from 'react';

import { useAuth } from './AuthProvider';

/**
 * The sign-in entry point.
 *
 * It renders a single USWDS button and NOTHING resembling a username/password
 * form: the application never sees credentials — that is the entire point of
 * SSO. Clicking the button asks the API for the authorize URL and performs a
 * full-page navigation to Keycloak, where the password + TOTP challenge happens.
 */
export function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSignIn = (): void => {
    setBusy(true);
    setError(null);
    login().catch(() => {
      setError('Could not start sign-in. Please try again.');
      setBusy(false);
    });
  };

  return (
    <main id="main-content">
      <GridContainer>
        <h1>JudicialSync Platform Core</h1>
        <p>Sign in with your court identity. You will be redirected to complete sign-in.</p>
        {error !== null ? (
          <p className="usa-error-message" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" onClick={onSignIn} disabled={busy} data-testid="sign-in">
          {busy ? 'Redirecting…' : 'Sign in'}
        </Button>
      </GridContainer>
    </main>
  );
}
