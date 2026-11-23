import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, EmptyState, Field, Icon, IconButton, LoadingState, Notice, Panel } from './ui';

type Slot = { id: string; startsAt: string; endsAt: string; timeZone: string };
type Booking = Pick<Slot, 'id' | 'startsAt' | 'endsAt'> & {
  slotId: string; studentReference?: string; studentDisplayName?: string | null; cancellationChargeApplies?: boolean;
};
const endpoint = '/api/schedule/slots';
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const display = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
        if (!controller.signal.aborted) setError('Could not load the schedule. Refresh to try again.');
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
        const result: { message?: string } = await response.json();
        setError(response.status < 500 && result.message ? result.message : 'Could not save the schedule. Try again.');
        if (response.status === 409) setRevision((value) => value + 1);
        return null;
      }
      setRevision((value) => value + 1);
      return response;
    } catch {
      setError('Could not reach the server. Try again.');
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
      setError('Choose a valid local date and time.');
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
    <section className="schedule-stack" hidden={view === 'students'} aria-label="Lesson schedule">
      <div className="section-tools">
        <p className="muted">Times shown in <strong>{viewerZone}</strong></p>
        <IconButton icon="refresh" label="Refresh schedule" variant="quiet" onClick={() => {
          setError('');
          setRevision((value) => value + 1);
        }} />
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className={teacher ? 'schedule-grid' : 'schedule-stack'} hidden={view !== 'schedule'}>
        {teacher && (
          <Panel className="slot-form">
            <h2>Publish a slot</h2>
            <form onSubmit={publish}>
              <fieldset disabled={busy} className="form-stack">
                <Field label="Start date and time">
                  <input type="datetime-local" required
                    value={start} onChange={(event) => setStart(event.target.value)} />
                </Field>
                <Field label="Duration in minutes">
                  <input type="number" required min={1} max={1440}
                    value={duration} onChange={(event) => setDuration(event.target.value)} />
                </Field>
                <Button variant="primary" type="submit"><Icon name="plus" />Publish slot</Button>
              </fieldset>
            </form>
          </Panel>
        )}
        <section aria-labelledby="availability-heading" className="list-section">
          <h2 id="availability-heading">Available lesson times</h2>
          {slots === null && !error && <LoadingState label="Loading the schedule…" />}
          {slots?.length === 0 && <EmptyState icon="schedule" title="No upcoming times are open">
            {teacher ? 'Publish a slot to open it for student booking.' : 'Check back when your teacher publishes a time.'}
          </EmptyState>}
          {!!slots?.length && (
            <ul className="item-list">
              {slots.map((slot) => (
                <li key={slot.id} className="item-row">
                  <p className="item-title"><time dateTime={slot.startsAt}>{display.formatRange(new Date(slot.startsAt), new Date(slot.endsAt))}</time></p>
                  {teacher ? <Button variant="quiet" disabled={busy}
                    aria-label={`Close slot at ${display.format(new Date(slot.startsAt))}`}
                    onClick={() => void mutate(`${endpoint}/${slot.id}/close`)}>Close</Button>
                    : selected?.slotId === slot.id ? (
                      <div className="actions">
                        <Button variant="primary" disabled={busy} onClick={async () => {
                          if (await mutate(`${endpoint}/${slot.id}/book?requestId=${selected.requestId}`)) {
                            setSelected(null);
                            setNotice('Lesson booked.');
                          }
                        }}>Confirm booking</Button>
                        <Button variant="quiet" disabled={busy} onClick={() => setSelected(null)}>Back</Button>
                      </div>
                    ) : <Button variant="primary" disabled={busy}
                      aria-label={`Book lesson at ${display.format(new Date(slot.startsAt))}`}
                      onClick={() => {
                        setSelected({ slotId: slot.id, requestId: crypto.randomUUID() });
                        setNotice('');
                        setError('');
                      }}>Book <Icon name="arrow" /></Button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section aria-label="Upcoming reservations" hidden={view !== 'lessons'}>
        {bookings === null && !error && <LoadingState label="Loading upcoming lessons…" />}
        {bookings?.length === 0 && <EmptyState icon="lessons" title="No lessons are booked yet">
          Booked lessons will appear here.
        </EmptyState>}
        {!!bookings?.length && (
          <ul className="item-list">
            {bookings.map((booking) => (
              <li key={booking.id} className="item-row lesson-row">
                <div>
                  <p className="item-title"><time dateTime={booking.startsAt}>{display.formatRange(new Date(booking.startsAt), new Date(booking.endsAt))}</time></p>
                  {booking.studentReference && <p className="muted">
                    {booking.studentDisplayName ?? `Student ID ${booking.studentReference}`}
                  </p>}
                </div>
                {!teacher && (cancelling === booking.id ? (
                  <div className="confirmation">
                    <Notice tone={booking.cancellationChargeApplies ? 'warning' : 'info'}>
                      {booking.cancellationChargeApplies
                        ? 'This is the lesson day in the teacher’s time zone. Cancelling will count as a paid lesson.'
                        : 'You can cancel without a charge before the lesson day in the teacher’s time zone.'}
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
                            ? 'Lesson cancelled. Recorded as chargeable.'
                            : 'Lesson cancelled without a charge.');
                        }
                      }}>{booking.cancellationChargeApplies ? 'Cancel and accept charge' : 'Confirm cancellation'}</Button>
                      <Button variant="quiet" disabled={busy} onClick={() => setCancelling(null)}>Keep lesson</Button>
                    </div>
                  </div>
                ) : <Button variant="quiet" disabled={busy}
                  aria-label={`Cancel lesson at ${display.format(new Date(booking.startsAt))}`}
                  onClick={() => { setCancelling(booking.id); setNotice(''); setError(''); }}>Cancel lesson</Button>)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
