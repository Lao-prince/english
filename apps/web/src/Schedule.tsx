import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, EmptyState, Field, Icon, IconButton, LoadingState, Notice, Panel } from './ui';
import { apiMessage } from './apiMessage';
import { LessonTime } from './LessonTime';
import { LessonCalendar, localDateKey } from './LessonCalendar';

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
  const [day, setDay] = useState(() => new Date());
  const [startTime, setStartTime] = useState('');
  const [showPublisher, setShowPublisher] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const dayKey = localDateKey(day);
  const keyFor = (entry: Slot | Booking) => localDateKey(new Date(entry.startsAt));
  const daySlots = slots?.filter((entry) => keyFor(entry) === dayKey);
  const dayBookings = bookings?.filter((entry) => keyFor(entry) === dayKey);
  const entries = (view === 'lessons' ? bookings : slots) ?? [];
  const markedDates = new Set(entries.map(keyFor));
  const nextEntry = entries.find((entry) => keyFor(entry) > dayKey) ?? entries.find((entry) => keyFor(entry) !== dayKey);

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
    const start = `${dayKey}T${startTime}`;
    const local = new Date(start);
    const pad = (value: number) => String(value).padStart(2, '0');
    const calendar = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    if (calendar !== start || !Number.isFinite(local.getTime())) {
      setError('Укажите корректные дату и время.');
      return;
    }

    const details = { startsAt: local.toISOString(), durationMinutes: 60, timeZone: viewerZone };
    const key = JSON.stringify(details);
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    if (await mutate(endpoint, { id: pending.current.id, ...details })) {
      pending.current = null;
      setStartTime('');
      setShowPublisher(false);
      setNotice('Время открыто для записи.');
    }
  }

  return (
    <section className="schedule-stack" hidden={view === 'students'} aria-label="Расписание уроков">
      <LessonCalendar key={view} selected={day} onSelect={setDay} marked={markedDates} />
      <div className="section-tools">
        <p className="muted">Часовой пояс: <strong>{viewerZoneLabel}</strong></p>
        <IconButton icon="refresh" label="Обновить расписание" variant="quiet" onClick={() => {
          setError('');
          setRevision((value) => value + 1);
        }} />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className="schedule-stack" hidden={view !== 'schedule'}>
        {teacher && <div className="actions">
          <Button variant="primary" aria-expanded={showPublisher} aria-controls="slot-publisher"
            onClick={() => setShowPublisher(!showPublisher)}><Icon name="plus" />Добавить время</Button>
        </div>}
        {teacher && <div id="slot-publisher" hidden={!showPublisher}>
          <Panel className="slot-form">
            <h2>Открыть запись</h2>
            <form onSubmit={publish}>
              <fieldset disabled={busy} className="form-stack">
                <Field label="Время начала">
                  <input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                </Field>
                <p className="muted">Урок длится 1 час.</p>
                <Button variant="primary" type="submit">Открыть запись</Button>
              </fieldset>
            </form>
          </Panel>
        </div>}
        <section aria-labelledby="availability-heading" className="list-section">
          <h2 id="availability-heading">Свободное время</h2>
          {slots === null && !error && <LoadingState label="Загружаем расписание…" />}
          {daySlots?.length === 0 && <EmptyState icon="schedule" title="На эту дату нет свободного времени">
            {teacher ? 'Можно открыть запись на выбранную дату.' : 'Выберите другой день в календаре.'}
          </EmptyState>}
          {!!daySlots?.length && (
            <ul className="lesson-cards">{daySlots.map((slot) => (
                <li key={slot.id} className="item-row lesson-card">
                  <div className="lesson-card-main">
                    <span className="icon-tile"><Icon name="schedule" /></span>
                    <p className="item-title"><LessonTime {...slot} /></p>
                  </div>
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
            ))}</ul>
          )}
        </section>
      </div>
      <section aria-label="Предстоящие записи" hidden={view !== 'lessons'}>
        {bookings === null && !error && <LoadingState label="Загружаем уроки…" />}
        {dayBookings?.length === 0 && <EmptyState icon="lessons" title="На эту дату нет уроков">
          Выберите другой день в календаре.
        </EmptyState>}
        {!!dayBookings?.length && (
          <ul className="lesson-cards">{dayBookings.map((booking) => (
              <li key={booking.id} className="item-row lesson-row lesson-card lesson-card--booked">
                <div className="lesson-card-main">
                  <span className="icon-tile"><Icon name="lessons" /></span>
                  <div>
                    <p className="item-title">{booking.studentDisplayName ?? 'Урок английского'}</p>
                    <p className="muted"><LessonTime {...booking} /></p>
                    {booking.studentReference && !booking.studentDisplayName && <p className="muted">ID ученика: {booking.studentReference}</p>}
                  </div>
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
          ))}</ul>
        )}
      </section>
      {nextEntry && !(view === 'lessons' ? dayBookings?.length : daySlots?.length) && (
        <Button onClick={() => setDay(new Date(nextEntry.startsAt))}>
          {view === 'lessons' ? 'Перейти к дате с уроками' : 'Перейти к дате со свободным временем'} <Icon name="arrow" />
        </Button>
      )}
    </section>
  );
}
