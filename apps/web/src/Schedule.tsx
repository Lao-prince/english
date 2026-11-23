import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, EmptyState, Field, Icon, IconButton, LoadingState, Notice, Panel } from './ui';
import { apiMessage } from './apiMessage';
import { LessonTime, ScheduleDays } from './ScheduleDays';

type Slot = { id: string; startsAt: string; endsAt: string; timeZone: string };
type Booking = Pick<Slot, 'id' | 'startsAt' | 'endsAt'> & {
  slotId: string; studentReference?: string; studentDisplayName?: string | null; cancellationChargeApplies?: boolean;
};
const endpoint = '/api/schedule/slots';
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const viewerZoneLabel = new Intl.DateTimeFormat('ru-RU', { timeZone: viewerZone, timeZoneName: 'longGeneric' })
  .formatToParts().find(({ type }) => type === 'timeZoneName')?.value ?? viewerZone;
const display = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function Schedule({ teacher, token, view }: { teacher: boolean; token: string; view: 'schedule' | 'lessons' | 'students' }) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [selected, setSelected] = useState<{ slotId: string; requestId: string } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState('60');
  const pending = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (view === 'students') return;
    const controller = new AbortController();
    const options = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal };
    Promise.all([fetch(endpoint, options), fetch('/api/schedule/bookings', options)])
      .then(async ([available, upcoming]) => {
        if (!available.ok || !upcoming.ok) throw new Error();
        const [slotList, bookingList] = await Promise.all([available.json(), upcoming.json()]);
        if (!controller.signal.aborted) {
          setSlots(slotList);
          setBookings(bookingList);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Не удалось загрузить расписание. Обновите его и попробуйте снова.');
      });
    return () => controller.abort();
  }, [revision, token, view]);

  async function mutate(url: string, body?: object) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      if (body) headers.set('Content-Type', 'application/json');
      const response = await fetch(url, { method: 'POST', headers, body: body && JSON.stringify(body) });
      if (!response.ok) {
        setError(await apiMessage(response, 'Не удалось сохранить изменения. Попробуйте ещё раз.'));
        if (response.status === 409) setRevision((value) => value + 1);
        return null;
      }
      setRevision((value) => value + 1);
      return response;
    } catch {
      setError('Нет связи с сервером. Попробуйте ещё раз.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const local = new Date(start);
    const pad = (value: number) => String(value).padStart(2, '0');
    const calendar = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    if (calendar !== start || !Number.isFinite(local.getTime())) {
      setError('Укажите корректные дату и время.');
      return;
    }

    const details = { startsAt: local.toISOString(), durationMinutes: Number(duration), timeZone: viewerZone };
    const key = JSON.stringify(details);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    if (await mutate(endpoint, { id: pending.current.id, ...details })) {
      pending.current = null;
      setStart('');
    }
  }

  return (
    <section className="schedule-stack" hidden={view === 'students'} aria-label="Расписание уроков">
      <div className="section-tools">
        <p className="muted">Часовой пояс: <strong>{viewerZoneLabel}</strong></p>
        <IconButton icon="refresh" label="Обновить расписание" variant="quiet" onClick={() => {
          setError('');
          setRevision((value) => value + 1);
        }} />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className={teacher ? 'schedule-grid' : 'schedule-stack'} hidden={view !== 'schedule'}>
        {teacher && (
          <Panel className="slot-form">
            <h2>Добавить время</h2>
            <form onSubmit={publish}>
              <fieldset disabled={busy} className="form-stack">
                <Field label="Дата и время начала">
                  <input type="datetime-local" required
                    value={start} onChange={(event) => setStart(event.target.value)} />
                </Field>
                <Field label="Длительность в минутах">
                  <input type="number" required min={1} max={1440}
                    value={duration} onChange={(event) => setDuration(event.target.value)} />
                </Field>
                <Button variant="primary" type="submit"><Icon name="plus" />Открыть запись</Button>
              </fieldset>
            </form>
          </Panel>
        )}
        <section aria-labelledby="availability-heading" className="list-section">
          <h2 id="availability-heading">Свободное время</h2>
          {slots === null && !error && <LoadingState label="Загружаем расписание…" />}
          {slots?.length === 0 && <EmptyState icon="schedule" title="Свободного времени пока нет">
            {teacher ? 'Добавьте время, чтобы ученики могли записаться.' : 'Здесь появится время, которое откроет преподаватель.'}
          </EmptyState>}
          {!!slots?.length && (
            <ScheduleDays items={slots} renderRow={(slot) => (
                <li key={slot.id} className="item-row">
                  <p className="item-title"><LessonTime {...slot} /></p>
                  {teacher ? <Button variant="quiet" disabled={busy}
                    aria-label={`Закрыть запись на ${display.format(new Date(slot.startsAt))}`}
                    onClick={() => void mutate(`${endpoint}/${slot.id}/close`)}>Закрыть</Button>
                    : selected?.slotId === slot.id ? (
                      <div className="actions">
                        <Button variant="primary" disabled={busy} onClick={async () => {
                          if (await mutate(`${endpoint}/${slot.id}/book?requestId=${selected.requestId}`)) {
                            setSelected(null);
                            setNotice('Вы записаны на урок.');
                          }
                        }}>Подтвердить запись</Button>
                        <Button variant="quiet" disabled={busy} onClick={() => setSelected(null)}>Назад</Button>
                      </div>
                    ) : <Button variant="primary" disabled={busy}
                      aria-label={`Записаться на урок на ${display.format(new Date(slot.startsAt))}`}
                      onClick={() => {
                        setSelected({ slotId: slot.id, requestId: crypto.randomUUID() });
                        setNotice('');
                        setError('');
                      }}>Записаться <Icon name="arrow" /></Button>}
                </li>
            )} />
          )}
        </section>
      </div>
      <section aria-label="Предстоящие записи" hidden={view !== 'lessons'}>
        {bookings === null && !error && <LoadingState label="Загружаем уроки…" />}
        {bookings?.length === 0 && <EmptyState icon="lessons" title="Записей пока нет">
          Здесь появятся предстоящие уроки.
        </EmptyState>}
        {!!bookings?.length && (
          <ScheduleDays items={bookings} heading="h2" renderRow={(booking) => (
              <li key={booking.id} className="item-row lesson-row">
                <div>
                  <p className="item-title"><LessonTime {...booking} /></p>
                  {booking.studentReference && <p className="muted">
                    {booking.studentDisplayName ?? `ID ученика: ${booking.studentReference}`}
                  </p>}
                </div>
                {!teacher && (cancelling === booking.id ? (
                  <div className="confirmation">
                    <Notice tone={booking.cancellationChargeApplies ? 'warning' : 'info'}>
                      {booking.cancellationChargeApplies
                        ? 'По времени преподавателя урок уже сегодня. При отмене он будет считаться оплаченным.'
                        : 'До дня урока по времени преподавателя отмена бесплатна.'}
                    </Notice>
                    <div className="actions">
                      <Button variant="danger" disabled={busy} onClick={async () => {
                        const response = await mutate(`/api/schedule/bookings/${booking.id}/cancel`, {
                          acceptSameDayCharge: booking.cancellationChargeApplies === true,
                        });
                        if (response) {
                          const { chargeApplies }: { chargeApplies: boolean } = await response.json();
                          setCancelling(null);
                          setNotice(chargeApplies
                            ? 'Урок отменён. Отмена отмечена как платная.'
                            : 'Урок отменён без списания.');
                        }
                      }}>{booking.cancellationChargeApplies ? 'Отменить со списанием' : 'Подтвердить отмену'}</Button>
                      <Button variant="quiet" disabled={busy} onClick={() => setCancelling(null)}>Оставить урок</Button>
                    </div>
                  </div>
                ) : <Button variant="quiet" disabled={busy}
                  aria-label={`Отменить урок на ${display.format(new Date(booking.startsAt))}`}
                  onClick={() => { setCancelling(booking.id); setNotice(''); setError(''); }}>Отменить урок</Button>)}
              </li>
          )} />
        )}
      </section>
    </section>
  );
}
