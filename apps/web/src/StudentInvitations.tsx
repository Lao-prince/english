import { useState } from 'react';
import { Button, Field, Icon, Notice, Panel } from './ui';

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
    <Panel className="invitation-panel">
      <span className="icon-tile"><Icon name="students" /></span>
      <h2>Invite a student</h2>
      <p className="muted">Share an invitation to give a student access to English Space.</p>
      <Button variant="primary" disabled={busy} onClick={() => void create()}>
        <Icon name="plus" />
        {busy ? 'Creating invitation…' : 'Create student invitation'}
      </Button>
      {invitation && (
        <div className="invitation-result">
          <p className="muted">Share privately. This invitation works once and expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
          <Field label={invitation.link ? 'Invitation link' : 'Invitation code'}>
            <input readOnly
              value={invitation.link ?? invitation.code} onFocus={(event) => event.target.select()} />
          </Field>
          <Button onClick={async () => {
            try {
              await navigator.clipboard.writeText(invitation.link ?? invitation.code);
              setMessage('Invitation copied.');
            } catch {
              setMessage('Select the invitation text to copy it manually.');
            }
          }}><Icon name="copy" />Copy invitation</Button>
        </div>
      )}
      {message && <Notice tone={message === 'Invitation copied.' ? 'success' : message.startsWith('Could not') ? 'danger' : 'info'}>{message}</Notice>}
    </Panel>
  );
}
