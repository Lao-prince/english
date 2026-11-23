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
      setMessage('Не удалось создать приглашение. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="invitation-panel">
      <span className="icon-tile"><Icon name="students" /></span>
      <h2>Пригласить ученика</h2>
      <p className="muted">Отправьте приглашение, чтобы ученик получил доступ к English Space.</p>
      <Button variant="primary" disabled={busy} onClick={() => void create()}>
        <Icon name="plus" />
        {busy ? 'Создаём приглашение…' : 'Создать приглашение'}
      </Button>
      {invitation && (
        <div className="invitation-result">
          <p className="muted">Отправьте приглашение в личном сообщении. Оно одноразовое и действует до {new Date(invitation.expiresAt).toLocaleString('ru-RU')}.</p>
          <Field label={invitation.link ? 'Ссылка-приглашение' : 'Код приглашения'}>
            <input readOnly
              value={invitation.link ?? invitation.code} onFocus={(event) => event.target.select()} />
          </Field>
          <Button onClick={async () => {
            try {
              await navigator.clipboard.writeText(invitation.link ?? invitation.code);
              setMessage('Приглашение скопировано.');
            } catch {
              setMessage('Выделите текст приглашения, чтобы скопировать его вручную.');
            }
          }}><Icon name="copy" />Скопировать приглашение</Button>
        </div>
      )}
      {message && <Notice tone={message === 'Приглашение скопировано.' ? 'success' : message.startsWith('Не удалось') ? 'danger' : 'info'}>{message}</Notice>}
    </Panel>
  );
}
