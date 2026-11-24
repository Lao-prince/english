import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, IconButton, LoadingState, Notice, Panel } from './ui';
import { apiMessage } from './apiMessage';

const labels = {
  GRANT: 'Пополнение баланса',
  COMPLETED_LESSON: 'Проведённый урок',
  SAME_DAY_CANCELLATION: 'Отмена в день урока',
  DEBIT_REVERSAL: 'Возврат занятия',
} as const;
type Reason = keyof typeof labels;
type Summary = {
  balance: number;
  nonExpiringBalance: number;
  packages: { id: string; amount: number; remaining: number; validThrough: string; timeZone: string; expired: boolean }[];
  entries: { id: string; amount: number; reason: Reason; createdAt: string; reversed: boolean }[];
  pending?: { bookingId: string; startsAt: string; reason: 'COMPLETED_LESSON' | 'SAME_DAY_CANCELLATION' }[];
};
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const calendarDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' });
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CreditLedger({ token, studentId }: { token: string; studentId?: string }) {
  const endpoint = studentId ? `/api/credits/students/${studentId}` : '/api/credits/me';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revision, setRevision] = useState(0);
  const [amount, setAmount] = useState('');
  const [validThrough, setValidThrough] = useState('');
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const grant = useRef<{ id: string; amount: number; package?: { validThrough: string; timeZone: string } } | null>(null);

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

  async function save(action: 'grant' | 'settle' | 'reverse' | 'complete', body: object, text: string) {
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
      if (action === 'complete') {
        const outcome: { entry: object | null } = await response.json();
        text = outcome.entry
          ? 'Урок отмечен проведённым. Одно занятие списано.'
          : 'Урок отмечен проведённым без списания.';
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
    const terms = validThrough ? { validThrough, timeZone } : undefined;
    if (grant.current?.amount !== value || grant.current?.package?.validThrough !== terms?.validThrough) {
      grant.current = { id: crypto.randomUUID(), amount: value, package: terms };
    }
    if (await save('grant', grant.current, 'Занятия добавлены.')) {
      grant.current = null;
      setAmount('');
      setValidThrough('');
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
      {!studentId && summary?.balance === 1 && <Notice tone="warning">Осталось одно занятие.</Notice>}
      {!studentId && summary?.balance === 0 && <Notice>Нет доступных занятий. Обратитесь к преподавателю, чтобы пополнить баланс.</Notice>}
      {studentId && summary && (
        <>
          <form className="form-stack" onSubmit={addCredits}>
            <Field label="Сколько занятий добавить">
              <input type="number" min={1} max={100} step={1} required value={amount} disabled={busy}
                onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="Последний день действия">
              <input type="date" value={validThrough} disabled={busy} onChange={(event) => setValidThrough(event.target.value)} />
            </Field>
            <p className="muted">Дата считается по часовому поясу устройства ({timeZone}). Оставьте поле пустым для бессрочных занятий.</p>
            <Button type="submit" variant="primary" disabled={busy}>{validThrough ? 'Выдать абонемент' : 'Добавить занятия'}</Button>
          </form>
          <section aria-label="Уроки к подтверждению">
            <p className="item-title">Требуют подтверждения</p>
            {summary.pending?.length ? (
              <ul className="item-list">
                {summary.pending.map((lesson) => (
                  <li key={lesson.bookingId} className="item-row">
                    <div>
                      <p>{lesson.reason === 'COMPLETED_LESSON' ? 'Прошедший урок' : labels[lesson.reason]}</p>
                      <time className="muted" dateTime={lesson.startsAt}>{date.format(new Date(lesson.startsAt))}</time>
                    </div>
                    <Button disabled={busy || (lesson.reason === 'SAME_DAY_CANCELLATION' && summary.balance === 0)}
                      onClick={() => void save(lesson.reason === 'COMPLETED_LESSON' ? 'complete' : 'settle',
                        { bookingId: lesson.bookingId }, 'Одно занятие списано.')}>
                      {lesson.reason === 'COMPLETED_LESSON' ? 'Отметить проведённым' : 'Списать одно занятие'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Нет уроков, требующих подтверждения.</p>}
            {summary.pending?.some(({ reason }) => reason === 'SAME_DAY_CANCELLATION') && summary.balance === 0 &&
              <p className="muted">Для списания за отмену в день урока сначала пополните баланс.</p>}
          </section>
        </>
      )}
      {!!summary?.packages?.length && (
        <section aria-label="Абонементы">
          <p className="item-title">Абонементы</p>
          {summary.nonExpiringBalance > 0 && <p className="muted">Бессрочные занятия: {summary.nonExpiringBalance}</p>}
          <ul className="item-list">
            {summary.packages.map((pack) => (
              <li key={pack.id} className="item-row">
                <div>
                  <p>Осталось {pack.remaining} из {pack.amount}</p>
                  <progress value={pack.amount - pack.remaining} max={pack.amount} aria-label="Использовано занятий" />
                  <p className="muted">{pack.expired ? 'Срок истёк' : pack.remaining ? 'Действует по' : 'Занятия закончились. Срок был до'}{' '}
                    <time dateTime={pack.validThrough}>{calendarDate.format(new Date(pack.validThrough))}</time>
                    {' '}({pack.timeZone})
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary && <section aria-label="История операций">
        <p className="item-title">История операций</p>
        {summary.entries.length ? <ul className="item-list">
          {summary.entries.map((entry) => (
            <li key={entry.id} className="item-row">
              <div>
                <p>{labels[entry.reason]}</p>
                <time className="muted" dateTime={entry.createdAt}>{date.format(new Date(entry.createdAt))}</time>
                {entry.reversed && <p className="muted">Списание отменено</p>}
              </div>
              <div className="actions">
                <strong>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong>
                {studentId && entry.amount < 0 && !entry.reversed && reversing !== entry.id && (
                  <Button variant="quiet" disabled={busy} onClick={() => setReversing(entry.id)}>Отменить списание</Button>
                )}
              </div>
              {studentId && !entry.reversed && reversing === entry.id && (
                <div className="confirmation">
                  <p>Занятие вернётся туда, откуда его списали. Если срок абонемента истёк, доступный остаток не изменится. За этот урок больше нельзя будет списать занятие.</p>
                  <div className="actions">
                    <Button variant="primary" disabled={busy} onClick={async () => {
                      if (await save('reverse', { entryId: entry.id }, 'Одно занятие возвращено.')) setReversing(null);
                    }}>Вернуть занятие</Button>
                    <Button variant="quiet" disabled={busy} onClick={() => setReversing(null)}>Назад</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul> : <p className="muted">Операций пока нет.</p>}
      </section>}
    </Panel>
  );
}
