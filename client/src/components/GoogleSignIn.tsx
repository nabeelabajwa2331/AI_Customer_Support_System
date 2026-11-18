import { useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';

// Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client).
interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: string;
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
/** Google's button accepts widths from 200 to 400 px. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 336;

let scriptPromise: Promise<void> | null = null;
let initializedFor: string | null = null;

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
 *
 * The button is drawn by Google inside an iframe, so its appearance is set via
 * Google's options (theme, width, shape), not CSS. It is re-rendered to match
 * the app theme and the width of the form.
 */
export function GoogleSignIn({ onCredential, onError, text = 'continue_with' }: GoogleSignInProps) {
  const { resolved: theme } = useTheme();
  const [clientId, setClientId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  // Latest callbacks without re-initializing Google on every render.
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };

  useEffect(() => {
    api
      .googleConfig()
      .then((config) => setClientId(config.enabled ? config.clientId : null))
      .catch(() => setClientId(null));
  }, []);

  // Track the available width so the button always fills the form.
  useEffect(() => {
    const element = frame.current;
    if (!clientId || !element) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Falls back to a typical form width when layout is not measurable yet.
    const measure = () => setWidth(Math.round(element.clientWidth) || DEFAULT_WIDTH);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 120);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [clientId]);

  useEffect(() => {
    if (!clientId || width === 0) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        const google = window.google?.accounts.id;
        if (cancelled || !google || !target.current) return;

        if (initializedFor !== clientId) {
          google.initialize({
            client_id: clientId,
            ux_mode: 'popup',
            callback: (response) => handlers.current.onCredential(response.credential),
          });
          initializedFor = clientId;
        }

        target.current.replaceChildren();
        google.renderButton(target.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          logo_alignment: 'left',
          text,
          width: Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH)),
        });
        setReady(true);
      })
      .catch((error: Error) => handlers.current.onError(error.message));

    return () => {
      cancelled = true;
    };
  }, [clientId, text, theme, width]);

  if (!clientId) return null;

  return (
    <>
      <div className="divider">
        <span>or</span>
      </div>
      <div ref={frame} className="google-button" data-ready={ready ? 'true' : 'false'} data-testid="google-button">
        {ready ? null : <span className="google-button-placeholder" aria-hidden="true" />}
        <div ref={target} className="google-button-target" />
      </div>
    </>
  );
}
