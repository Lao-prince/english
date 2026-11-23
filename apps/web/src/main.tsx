import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Schedule } from './Schedule';
import { StudentInvitations } from './StudentInvitations';
import './styles.css';

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready(): void } };
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

  const teacher = view.state === 'signed-in' && view.account.role === 'TEACHER';

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">English Space</h1>
      {view.state === 'signed-in' ? (
        <>
          <p className="mt-2">{teacher ? 'Teacher workspace' : 'Student workspace'}</p>
          <Schedule teacher={teacher} token={readToken()} />
          {teacher && <StudentInvitations token={readToken()} />}
        </>
      ) : (
        <p role="status" className="mt-4 text-lg text-slate-600 dark:text-slate-300">{messages[view.state]}</p>
      )}
      {(view.state === 'pending' || view.state === 'invalid-invite') && (
        <form className="mt-5 grid gap-3" onSubmit={(event) => {
          event.preventDefault();
          setView({ state: 'loading' });
          setSubmittedCode(code.trim());
          setAttempt((value) => value + 1);
        }}>
          <label className="grid gap-1">
            Invitation code
            <input className="min-w-0 rounded-lg border border-current p-2" required
              autoCapitalize="none" spellCheck={false} pattern="invite_[A-Za-z0-9_\-]{24}"
              value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button type="submit" className="w-fit rounded-lg border border-current px-4 py-2">Join as student</button>
        </form>
      )}
      {view.state === 'error' && (
        <button
          type="button"
          className="mt-5 w-fit rounded-lg bg-slate-900 px-4 py-2 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          onClick={() => {
            setView({ state: 'loading' });
            setAttempt(attempt + 1);
          }}
        >
          Try again
        </button>
      )}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
