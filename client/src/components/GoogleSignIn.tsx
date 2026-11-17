import { useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';

// Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client).
interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; text?: string; shape?: string; width?: number },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google sign-in.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface GoogleSignInProps {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  text?: 'continue_with' | 'signup_with';
}

/**
 * Renders Google's official button when the backend has a client ID configured.
 * Renders nothing when Google sign-in is disabled, so no dead control is shown.
 */
export function GoogleSignIn({ onCredential, onError, text = 'continue_with' }: GoogleSignInProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  // Latest callbacks without re-initializing Google on every render.
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    api
      .googleConfig()
      .then((config) => setClientId(config.enabled ? config.clientId : null))
      .catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        const google = window.google?.accounts.id;
        if (cancelled || !google || !container.current) return;

        google.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (response) => handlers.current.onCredential(response.credential),
        });
        google.renderButton(container.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          width: Math.min(container.current.clientWidth || 380, 400),
        });
      })
      .catch((error: Error) => handlers.current.onError(error.message));

    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) return null;

  return (
    <>
      <div className="divider">
        <span>or</span>
      </div>
      <div ref={container} className="google-button" data-testid="google-button" />
    </>
  );
}
