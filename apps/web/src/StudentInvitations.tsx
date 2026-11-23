import { useState } from 'react';

type Invitation = { code: string; expiresAt: string; link?: string };

export function StudentInvitations({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function create() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/invitations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      setInvitation(await response.json());
    } catch {
      setMessage('Could not create an invitation. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="students-heading" className="mt-6 space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 id="students-heading" className="text-xl font-semibold">Students</h2>
      <button type="button" disabled={busy} onClick={() => void create()}
        className="rounded-lg border border-current px-3 py-2 font-medium disabled:opacity-50">
        {busy ? 'Creating invitation…' : 'Create student invitation'}
      </button>
      {invitation && (
        <>
          <p>Share this invitation privately. It works once and expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
          <label className="grid gap-1">
            {invitation.link ? 'Invitation link' : 'Invitation code'}
            <input readOnly className="min-w-0 rounded-lg border border-current p-2"
              value={invitation.link ?? invitation.code} onFocus={(event) => event.target.select()} />
          </label>
          <button type="button" className="rounded-lg border border-current px-3 py-2" onClick={async () => {
            try {
              await navigator.clipboard.writeText(invitation.link ?? invitation.code);
              setMessage('Invitation copied.');
            } catch {
              setMessage('Select the invitation text to copy it manually.');
            }
          }}>Copy invitation</button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
