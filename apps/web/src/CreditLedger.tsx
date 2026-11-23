import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, IconButton, LoadingState, Notice, Panel } from './ui';
import { apiMessage } from './apiMessage';

const labels = {
  GRANT: 'Пополнение баланса',
  COMPLETED_LESSON: 'Проведённый урок',
  SAME_DAY_CANCELLATION: 'Отмена в день урока',
} as const;
type Reason = keyof typeof labels;
type Summary = {
  balance: number;
  entries: { id: string; amount: number; reason: Reason; createdAt: string }[];
  pending?: { bookingId: string; startsAt: string; reason: Exclude<Reason, 'GRANT'> }[];
};
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function CreditLedger({ token, studentId }: { token: string; studentId?: string }) {
  const endpoint = studentId ? `/api/credits/students/${studentId}` : '/api/credits/me';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revision, setRevision] = useState(0);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const grant = useRef<{ id: string; amount: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: Summary = await response.json();
        if (!controller.signal.aborted) setSummary(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFeedback({ tone: 'danger', text: 'Не удалось загрузить баланс.' });
      });
    return () => controller.abort();
  }, [endpoint, revision, token]);

  async function save(action: 'grant' | 'settle', body: object, text: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`${endpoint}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setFeedback({ tone: 'danger', text: await apiMessage(response, 'Не удалось обновить баланс. Попробуйте ещё раз.') });
        return false;
      }
      setFeedback({ tone: 'success', text });
      setRevision((value) => value + 1);
      return true;
    } catch {
      setFeedback({ tone: 'danger', text: 'Нет связи с сервером. Попробуйте ещё раз.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (grant.current?.amount !== value) grant.current = { id: crypto.randomUUID(), amount: value };
    if (await save('grant', grant.current, 'Занятия добавлены.')) {
      grant.current = null;
      setAmount('');
    }
  }

  return (
    <Panel>
      <div className="section-tools">
        <div>
          <h2>Баланс занятий</h2>
          {summary && <p className="item-title">Доступно занятий: {summary.balance}</p>}
        </div>
        <IconButton icon="refresh" label="Обновить баланс" variant="quiet" disabled={busy}
          onClick={() => { setFeedback(null); setRevision((value) => value + 1); }} />
      </div>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {!summary && !feedback && <LoadingState label="Загружаем баланс…" />}
      {studentId && summary && (
        <>
          <form className="form-stack" onSubmit={addCredits}>
            <Field label="Сколько занятий добавить">
              <input type="number" min={1} max={100} step={1} required value={amount} disabled={busy}
                onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>Добавить занятия</Button>
          </form>
          <section aria-label="Уроки к списанию">
            <p className="item-title">К списанию</p>
            {summary.pending?.length ? (
              <ul className="item-list">
                {summary.pending.map((lesson) => (
                  <li key={lesson.bookingId} className="item-row">
                    <div>
                      <p>{lesson.reason === 'COMPLETED_LESSON' ? 'Прошедший урок' : labels[lesson.reason]}</p>
                      <time className="muted" dateTime={lesson.startsAt}>{date.format(new Date(lesson.startsAt))}</time>
                    </div>
                    <Button disabled={busy || summary.balance === 0}
                      onClick={() => void save('settle', { bookingId: lesson.bookingId }, 'Одно занятие списано.')}>
                      {lesson.reason === 'COMPLETED_LESSON' ? 'Отметить проведённым и списать' : 'Списать одно занятие'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Нет уроков к списанию.</p>}
            {!!summary.pending?.length && summary.balance === 0 && <p className="muted">Чтобы списать занятие, пополните баланс.</p>}
          </section>
        </>
      )}
      {summary && <section aria-label="История операций">
        <p className="item-title">История операций</p>
        {summary.entries.length ? <ul className="item-list">
          {summary.entries.map((entry) => (
            <li key={entry.id} className="item-row">
              <div>
                <p>{labels[entry.reason]}</p>
                <time className="muted" dateTime={entry.createdAt}>{date.format(new Date(entry.createdAt))}</time>
              </div>
              <strong>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong>
            </li>
          ))}
        </ul> : <p className="muted">Операций пока нет.</p>}
      </section>}
    </Panel>
  );
}
