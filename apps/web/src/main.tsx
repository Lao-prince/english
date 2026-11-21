import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready(): void } };
  }
}

type Account = { id: string; role: 'TEACHER' | 'STUDENT' };
type View =
  | { state: 'loading' | 'browser' | 'pending' | 'expired' | 'error' }
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

async function loadAccount(initData: string, signal: AbortSignal): Promise<View> {
  let response = await fetchAccount(signal);
  if (response.status === 401) {
    saveToken('');
    if (!initData) return { state: 'browser' };

    const signIn = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
      signal,
    });
    if (signIn.status === 403) return { state: 'pending' };
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
  pending: 'Ask your teacher to approve your Telegram account, then reopen English Space.',
  expired: 'Close and reopen English Space in Telegram to refresh your sign-in.',
  error: 'English Space could not sign you in. Please try again.',
};

function App() {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const telegram = window.Telegram?.WebApp;
    telegram?.ready();
    loadAccount(telegram?.initData ?? '', controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setView(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setView({ state: 'error' });
      });
    return () => controller.abort();
  }, [attempt]);

  const teacher = view.state === 'signed-in' && view.account.role === 'TEACHER';

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">English Space</h1>
      {view.state === 'signed-in' ? (
        <section className="mt-8 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-xl font-semibold">{teacher ? 'Teaching workspace' : 'Your lessons'}</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            {teacher ? 'Scheduling will appear here when it becomes available.' : 'Your upcoming lessons will appear here once booking opens.'}
          </p>
        </section>
      ) : (
        <p role="status" className="mt-4 text-lg text-slate-600 dark:text-slate-300">{messages[view.state]}</p>
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
