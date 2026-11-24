import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Badge, Button, EmptyState, Field, Icon, IconButton, LoadingState, Notice, Panel } from './ui';
import { LessonHistory } from './LessonHistory';
import { LessonMoves, type LessonMove } from './LessonMoves';
import { StudentAvatar } from './StudentAvatar';
import { apiMessage } from './apiMessage';
import { LessonTime } from './LessonTime';
import { LessonCalendar, localDateKey } from './LessonCalendar';

type Slot = { id: string; startsAt: string; endsAt: string; timeZone: string };
type Booking = Pick<Slot, 'id' | 'startsAt' | 'endsAt'> & {
  slotId: string; studentReference?: string; studentDisplayName?: string | null; cancellationChargeApplies?: boolean;
  moves?: LessonMove[];
  studentAvatarUrl?: string | null;
};
const endpoint = '/api/schedule/slots';
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const viewerZoneLabel = new Intl.DateTimeFormat('ru-RU', { timeZone: viewerZone, timeZoneName: 'longGeneric' })
  .formatToParts().find(({ type }) => type === 'timeZoneName')?.value ?? viewerZone;
const display = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const fullDay = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' });

export function Schedule({ teacher, token, view }: {
  teacher: boolean; token: string; view: 'schedule' | 'lessons' | 'students' | 'subscription';
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [selected, setSelected] = useState<{ slotId: string; requestId: string } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [reopenSlot, setReopenSlot] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [reopenPreviousSlot, setReopenPreviousSlot] = useState(false);
  const pendingMove = useRef<{ key: string; requestId: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [day, setDay] = useState(() => new Date());
  const [startTime, setStartTime] = useState('');
  const [showPublisher, setShowPublisher] = useState(false);
  const [allUpcoming, setAllUpcoming] = useState(true);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const dayKey = localDateKey(day);
  const keyFor = (entry: Slot | Booking) => localDateKey(new Date(entry.startsAt));
  const daySlots = slots?.filter((entry) => keyFor(entry) === dayKey);
  const dayBookings = bookings?.filter((entry) => keyFor(entry) === dayKey);
  const showAll = view === 'lessons' && !teacher && allUpcoming;
  const visibleBookings = showAll ? bookings : dayBookings;
  const nearest = bookings?.[0];
  const calendarVisible = view === 'lessons' || view === 'schedule';
  const entries = (view === 'lessons' ? bookings : slots) ?? [];
  const markedDates = new Set(entries.map(keyFor));
  const nextEntry = entries.find((entry) => keyFor(entry) > dayKey) ?? entries.find((entry) => keyFor(entry) !== dayKey);

  useEffect(() => {
    if (view === 'students' || view === 'subscription') return;
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

  async function teacherCancel(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    const response = await mutate(`/api/schedule/bookings/${bookingId}/teacher-cancel`, {
      reopenSlot, reason: cancellationReason.trim() || undefined,
    });
    if (!response) return;
    const result: { reopenedSlot: boolean } = await response.json();
    setCancelling(null);
    setNotice(result.reopenedSlot ? 'Урок отменён. Время снова доступно для записи.' : 'Урок отменён. Время закрыто для записи.');
  }

  async function reschedule(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    const key = JSON.stringify([bookingId, destination, reopenPreviousSlot]);
    if (pendingMove.current?.key !== key) pendingMove.current = { key, requestId: crypto.randomUUID() };
    const response = await mutate(`/api/schedule/bookings/${bookingId}/reschedule`, {
      slotId: destination, reopenPreviousSlot, requestId: pendingMove.current.requestId,
    });
    if (!response) return;
    const result: { toStartsAt: string } = await response.json();
    setDay(new Date(result.toStartsAt));
    pendingMove.current = null;
    setMoving(null);
    setNotice('Урок перенесён.');
  }

  return (
    <section className="schedule-stack" hidden={!calendarVisible} aria-label="Расписание уроков">
      {!teacher && view === 'lessons' && nearest && (
        <Panel className="nearest-lesson">
          <div className="section-tools">
            <h2>{keyFor(nearest) === localDateKey(new Date()) ? 'Занятие сегодня' : 'Ближайшее занятие'}</h2>
            <Badge>Запись подтверждена</Badge>
          </div>
          <p className="item-title">{display.format(new Date(nearest.startsAt))}</p>
          <p className="muted">Преподаватель English Space</p>
          <Button variant="quiet" onClick={() => { setDay(new Date(nearest.startsAt)); setAllUpcoming(false); }}>
            Показать этот день <Icon name="arrow" />
          </Button>
        </Panel>
      )}
      <LessonCalendar key={view} selected={day} onSelect={(value) => {
        setDay(value);
        if (!teacher && view === 'lessons') setAllUpcoming(false);
      }} marked={markedDates} />
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
        {!teacher && <div className="section-tools upcoming-tools">
          <h2>{showAll ? 'Все предстоящие занятия' : 'Занятия выбранного дня'}</h2>
          {!showAll && <Button variant="quiet" onClick={() => setAllUpcoming(true)}>Показать все</Button>}
        </div>}
        {bookings === null && !error && <LoadingState label="Загружаем уроки…" />}
        {visibleBookings?.length === 0 && <EmptyState icon="lessons" title={showAll ? 'Предстоящих занятий пока нет' : 'На эту дату нет уроков'}>
          {showAll ? 'Свободное время есть в разделе «Запись», когда его открывает преподаватель.' : 'Выберите другой день в календаре.'}
        </EmptyState>}
        {!!visibleBookings?.length && (
          <ul className="lesson-cards">{visibleBookings.map((booking) => (
              <li key={booking.id} className="item-row lesson-row lesson-card lesson-card--booked">
                <div className="lesson-card-main">
                  {teacher ? <StudentAvatar name={booking.studentDisplayName} url={booking.studentAvatarUrl} /> :
                    <span className="icon-tile"><Icon name="lessons" /></span>}
                  <div>
                    <p className="item-title">{booking.studentDisplayName ?? 'Урок английского'}</p>
                    {showAll && <p className="muted">{fullDay.format(new Date(booking.startsAt))}</p>}
                    <p className="muted"><LessonTime {...booking} /></p>
                    {!teacher && <Badge>Предстоит</Badge>}
                    {booking.studentReference && !booking.studentDisplayName && <p className="muted">ID ученика: {booking.studentReference}</p>}
                  </div>
                </div>
                {teacher && (cancelling === booking.id ? (
                  <form className="confirmation" onSubmit={(event) => void teacherCancel(event, booking.id)}>
                    <p>Урок будет отменён без списания занятия у ученика.</p>
                    <Field label="Причина для ученика (необязательно)">
                      <textarea maxLength={200} rows={2} value={cancellationReason} disabled={busy}
                        onChange={(event) => setCancellationReason(event.target.value)} />
                    </Field>
                    <label className="actions">
                      <input type="checkbox" checked={reopenSlot} disabled={busy}
                        onChange={(event) => setReopenSlot(event.target.checked)} />
                      Снова открыть время для записи
                    </label>
                    <div className="actions">
                      <Button type="submit" variant="danger" disabled={busy}>Подтвердить отмену</Button>
                      <Button variant="quiet" disabled={busy} onClick={() => setCancelling(null)}>Оставить урок</Button>
                    </div>
                  </form>
                ) : moving !== booking.id && <div className="actions">
                  <Button variant="quiet" disabled={busy} onClick={() => {
                    setMoving(booking.id);
                    setCancelling(null);
                    setDestination('');
                    setReopenPreviousSlot(false);
                    setNotice('');
                    setError('');
                  }}>Перенести</Button>
                  <Button variant="quiet" disabled={busy} onClick={() => {
                    setMoving(null);
                    setCancelling(booking.id);
                    setCancellationReason('');
                    setReopenSlot(false);
                    setNotice('');
                    setError('');
                  }}>Отменить урок</Button>
                </div>)}
                {teacher && moving === booking.id && (
                  <form className="confirmation" onSubmit={(event) => void reschedule(event, booking.id)}>
                    {slots?.length ? <>
                      <Field label="Новое время">
                        <select required value={destination} disabled={busy} onChange={(event) => setDestination(event.target.value)}>
                          <option value="">Выберите свободный слот</option>
                          {slots.map((slot) => (
                            <option key={slot.id} value={slot.id}>{display.format(new Date(slot.startsAt))}</option>
                          ))}
                        </select>
                      </Field>
                      <label className="actions">
                        <input type="checkbox" checked={reopenPreviousSlot} disabled={busy}
                          onChange={(event) => setReopenPreviousSlot(event.target.checked)} />
                        Снова открыть прежнее время для записи
                      </label>
                    </> : <p className="muted">Свободных слотов нет. Сначала добавьте время в разделе «Слоты».</p>}
                    <div className="actions">
                      <Button type="submit" variant="primary" disabled={busy || !destination || !slots?.some(({ id }) => id === destination)}>
                        Подтвердить перенос
                      </Button>
                      <Button variant="quiet" disabled={busy} onClick={() => setMoving(null)}>Назад</Button>
                    </div>
                  </form>
                )}
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
                {!!booking.moves?.length && <LessonMoves moves={booking.moves} />}
              </li>
          ))}</ul>
        )}
      </section>
      {nextEntry && !showAll && !(view === 'lessons' ? dayBookings?.length : daySlots?.length) && (
        <Button onClick={() => setDay(new Date(nextEntry.startsAt))}>
          {view === 'lessons' ? 'Перейти к дате с уроками' : 'Перейти к дате со свободным временем'} <Icon name="arrow" />
        </Button>
      )}
      {!teacher && view === 'lessons' && <LessonHistory token={token} revision={revision} />}
    </section>
  );
}
