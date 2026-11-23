import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, IconButton, LoadingState, Notice, Panel } from './ui';

const labels = {
  GRANT: 'Credits added',
  COMPLETED_LESSON: 'Completed lesson',
  SAME_DAY_CANCELLATION: 'Same-day cancellation',
} as const;
type Reason = keyof typeof labels;
type Summary = {
  balance: number;
  entries: { id: string; amount: number; reason: Reason; createdAt: string }[];
  pending?: { bookingId: string; startsAt: string; reason: Exclude<Reason, 'GRANT'> }[];
};
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
        if (!controller.signal.aborted) setFeedback({ tone: 'danger', text: 'Could not load lesson credits.' });
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
        const error: { message?: string } = await response.json();
        throw new Error(response.status < 500 ? error.message : undefined);
      }
      setFeedback({ tone: 'success', text });
      setRevision((value) => value + 1);
      return true;
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error && error.message
        ? error.message : 'Could not update lesson credits. Try again.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (grant.current?.amount !== value) grant.current = { id: crypto.randomUUID(), amount: value };
    if (await save('grant', grant.current, 'Lesson credits added.')) {
      grant.current = null;
      setAmount('');
    }
  }

  return (
    <Panel>
      <div className="section-tools">
        <div>
          <h2>Lesson credits</h2>
          {summary && <p className="item-title">{summary.balance} available</p>}
        </div>
        <IconButton icon="refresh" label="Refresh lesson credits" variant="quiet" disabled={busy}
          onClick={() => { setFeedback(null); setRevision((value) => value + 1); }} />
      </div>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {!summary && !feedback && <LoadingState label="Loading lesson credits…" />}
      {studentId && summary && (
        <>
          <form className="form-stack" onSubmit={addCredits}>
            <Field label="Credits to add">
              <input type="number" min={1} max={100} step={1} required value={amount} disabled={busy}
                onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>Add credits</Button>
          </form>
          <section aria-label="Lessons awaiting settlement">
            <p className="item-title">Awaiting settlement</p>
            {summary.pending?.length ? (
              <ul className="item-list">
                {summary.pending.map((lesson) => (
                  <li key={lesson.bookingId} className="item-row">
                    <div>
                      <p>{lesson.reason === 'COMPLETED_LESSON' ? 'Past lesson' : labels[lesson.reason]}</p>
                      <time className="muted" dateTime={lesson.startsAt}>{date.format(new Date(lesson.startsAt))}</time>
                    </div>
                    <Button disabled={busy || summary.balance === 0}
                      onClick={() => void save('settle', { bookingId: lesson.bookingId }, 'One lesson credit used.')}>
                      {lesson.reason === 'COMPLETED_LESSON' ? 'Mark complete and use 1 credit' : 'Use 1 credit'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No lessons awaiting settlement.</p>}
            {!!summary.pending?.length && summary.balance === 0 && <p className="muted">Add credits to settle these lessons.</p>}
          </section>
        </>
      )}
      {summary && <section aria-label="Recent credit activity">
        <p className="item-title">Recent activity</p>
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
        </ul> : <p className="muted">No credit activity yet.</p>}
      </section>}
    </Panel>
  );
}
