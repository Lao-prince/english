import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiMessage } from './apiMessage';
import { Button, Field, LoadingState, Notice } from './ui';

type Slot = { id: string; startsAt: string };
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const endpoint = '/api/schedule/slots';

export function TeacherBooking({ studentId, token, close }: { studentId: string; token: string; close: () => void }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const pending = useRef<{ slotId: string; requestId: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result: Slot[] = await response.json();
        if (!controller.signal.aborted) setSlots(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFeedback({ tone: 'danger', text: 'Не удалось загрузить свободное время.' });
      });
    return () => controller.abort();
  }, [revision, token]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    if (pending.current?.slotId !== selected) pending.current = { slotId: selected, requestId: crypto.randomUUID() };
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`${endpoint}/${selected}/teacher-book`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, requestId: pending.current.requestId }),
      });
      if (!response.ok) {
        setFeedback({ tone: 'danger', text: await apiMessage(response, 'Не удалось записать ученика.') });
        if (response.status === 409) {
          setSelected('');
          setRevision((value) => value + 1);
        }
        return;
      }
      const booking: { startsAt: string } = await response.json();
      setFeedback({ tone: 'success', text: `Ученик записан: ${date.format(new Date(booking.startsAt))}.` });
      setSelected('');
      pending.current = null;
      setRevision((value) => value + 1);
    } catch {
      setFeedback({ tone: 'danger', text: 'Нет связи с сервером. Повторите подтверждение, чтобы проверить запись.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="confirmation" onSubmit={confirm}>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {slots === null && !feedback && <LoadingState label="Загружаем свободное время…" />}
      {slots?.length === 0 && <p className="muted">Свободного времени нет. Откройте запись в разделе «Слоты».</p>}
      {!!slots?.length && <Field label="Время занятия">
        <select required value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Выберите свободный слот</option>
          {slots.map((slot) => <option value={slot.id} key={slot.id}>{date.format(new Date(slot.startsAt))}</option>)}
        </select>
      </Field>}
      <div className="actions">
        {!!slots?.length && <Button type="submit" variant="primary" disabled={busy || !selected}>Подтвердить запись</Button>}
        {feedback?.tone === 'danger' && slots === null && <Button onClick={() => {
          setFeedback(null);
          setRevision((value) => value + 1);
        }}>Обновить свободное время</Button>}
        <Button variant="quiet" disabled={busy} onClick={close}>Закрыть</Button>
      </div>
    </form>
  );
}
