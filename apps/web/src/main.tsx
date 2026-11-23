import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand, Workspace } from './Workspace';
import { Button, Field, LoadingState, Notice, Panel } from './ui';
import './styles.css';

declare global {
  interface Window {
    Telegram?: { WebApp?: {
      initData: string;
      ready(): void;
      colorScheme?: 'light' | 'dark';
      viewportStableHeight?: number;
      safeAreaInset?: { bottom: number };
      contentSafeAreaInset?: { bottom: number };
      onEvent?(event: string, callback: () => void): void;
      offEvent?(event: string, callback: () => void): void;
    } };
  }
}

type Account = { id: string; role: 'TEACHER' | 'STUDENT' };
type View =
  | { state: 'loading' | 'browser' | 'pending' | 'invalid-invite' | 'expired' | 'error' }
  | { state: 'signed-in'; account: Account };

const sessionKey = 'english-space.session';
let token = '';

function readToken() {
  try {
    return sessionStorage.getItem(sessionKey) ?? token;
  } catch {
    return token;
  }
}

function saveToken(value: string) {
  token = value;
  try {
    if (value) sessionStorage.setItem(sessionKey, value);
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // In restricted WebViews the in-memory token still works.
  }
}

function fetchAccount(signal: AbortSignal) {
  return fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${readToken()}` },
    signal,
  });
}

async function loadAccount(initData: string, inviteCode: string, signal: AbortSignal): Promise<View> {
  const hasInvitation = !!(inviteCode || new URLSearchParams(initData).get('start_param')?.startsWith('invite_'));
  let response = hasInvitation ? undefined : await fetchAccount(signal);
  if (!response || response.status === 401) {
    saveToken('');
    if (!initData) return { state: 'browser' };

    const signIn = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, inviteCode: inviteCode || undefined }),
      signal,
    });
    if (signIn.status === 403) return { state: hasInvitation ? 'invalid-invite' : 'pending' };
    if (signIn.status === 401) return { state: 'expired' };
    if (!signIn.ok) return { state: 'error' };
    const session: { token: string } = await signIn.json();
    if (signal.aborted) return { state: 'error' };
    saveToken(session.token);
    response = await fetchAccount(signal);
  }

  if (!response.ok) return { state: 'error' };
  const account: Account = await response.json();
  return { state: 'signed-in', account };
}

const messages = {
  loading: 'Checking access…',
  browser: 'Open English Space from the Telegram bot to sign in.',
  pending: 'Enter the invitation code from your teacher.',
  'invalid-invite': 'This invitation is invalid, expired, or already used. Ask your teacher for a new one.',
  expired: 'Close and reopen English Space in Telegram to refresh your sign-in.',
  error: 'English Space could not sign you in. Please try again.',
};

function App() {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const miniApp = telegram?.initData ? telegram : undefined;
    const html = document.documentElement;
    const update = () => {
      html.dataset.theme = miniApp?.colorScheme ?? (systemTheme.matches ? 'dark' : 'light');
      if (miniApp?.viewportStableHeight) html.style.setProperty('--app-height', `${miniApp.viewportStableHeight}px`);
      const bottom = (miniApp?.safeAreaInset?.bottom ?? 0) + (miniApp?.contentSafeAreaInset?.bottom ?? 0);
      html.style.setProperty('--telegram-bottom', `${bottom}px`);
    };
    const events = ['themeChanged', 'viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'];
    update();
    systemTheme.addEventListener('change', update);
    for (const event of events) miniApp?.onEvent?.(event, update);
    return () => {
      systemTheme.removeEventListener('change', update);
      for (const event of events) miniApp?.offEvent?.(event, update);
      delete html.dataset.theme;
      html.style.removeProperty('--app-height');
      html.style.removeProperty('--telegram-bottom');
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const telegram = window.Telegram?.WebApp;
    telegram?.ready();
    loadAccount(telegram?.initData ?? '', submittedCode, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setView(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setView({ state: 'error' });
      });
    return () => controller.abort();
  }, [attempt, submittedCode]);

  if (view.state === 'signed-in') {
    return <Workspace teacher={view.account.role === 'TEACHER'} token={readToken()} />;
  }

  return (
    <main className="access">
      <Brand />
      <Panel className="access-panel">
        <h1>{view.state === 'pending' || view.state === 'invalid-invite' ? 'Join English Space' : 'English Space'}</h1>
        {view.state === 'loading' ? <LoadingState label={messages.loading} /> :
          <Notice tone={view.state === 'error' || view.state === 'invalid-invite' ? 'danger' : 'info'}>{messages[view.state]}</Notice>}
        {(view.state === 'pending' || view.state === 'invalid-invite') && (
          <form className="form-stack" onSubmit={(event) => {
            event.preventDefault();
            setView({ state: 'loading' });
            setSubmittedCode(code.trim());
            setAttempt((value) => value + 1);
          }}>
            <Field label="Invitation code">
              <input required
                autoCapitalize="none" spellCheck={false} pattern="invite_[A-Za-z0-9_\-]{24}"
                value={code} onChange={(event) => setCode(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary">Join as student</Button>
          </form>
        )}
        {view.state === 'error' && (
          <Button
            variant="primary"
            onClick={() => {
              setView({ state: 'loading' });
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </Button>
        )}
      </Panel>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
