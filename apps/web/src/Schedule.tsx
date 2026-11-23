import { useEffect, useRef, useState, type FormEvent } from 'react';

type Slot = { id: string; startsAt: string; endsAt: string; timeZone: string };
type Booking = Pick<Slot, 'id' | 'startsAt' | 'endsAt'> & {
  slotId: string; studentReference?: string; cancellationChargeApplies?: boolean;
};
const endpoint = '/api/schedule/slots';
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const display = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const button = 'rounded-lg border border-current px-3 py-2 font-medium disabled:opacity-50';

export function Schedule({ teacher, token }: { teacher: boolean; token: string }) {
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
  }, [revision, token]);

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
    <section aria-labelledby="schedule-heading" className="mt-8 space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="schedule-heading" className="text-xl font-semibold">Available lesson times</h2>
        <button type="button" className={button} onClick={() => {
          setError('');
          setRevision((value) => value + 1);
        }}>Refresh</button>
      </div>
      <p className="text-sm">Times shown in {viewerZone}.</p>
      {teacher && (
        <form onSubmit={publish} className="grid gap-3">
          <fieldset disabled={busy} className="grid min-w-0 gap-3">
            <label className="grid gap-1">
              Start date and time
              <input className="min-w-0 rounded-lg border border-current p-2" type="datetime-local" required
                value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="grid gap-1">
              Duration in minutes
              <input className="rounded-lg border border-current p-2" type="number" required min={1} max={1440}
                value={duration} onChange={(event) => setDuration(event.target.value)} />
            </label>
            <button className={button} type="submit">Publish slot</button>
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {slots === null && !error && <p role="status">Loading the schedule…</p>}
      {slots?.length === 0 && <p>No upcoming times are open.</p>}
      {!!slots?.length && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {slots.map((slot) => (
            <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>{display.formatRange(new Date(slot.startsAt), new Date(slot.endsAt))}</span>
              {teacher ? <button className={button} type="button" disabled={busy}
                aria-label={`Close slot at ${display.format(new Date(slot.startsAt))}`}
                onClick={() => void mutate(`${endpoint}/${slot.id}/close`)}>Close</button>
                : selected?.slotId === slot.id ? (
                  <div className="flex flex-wrap gap-2">
                    <button className={button} type="button" disabled={busy} onClick={async () => {
                      if (await mutate(`${endpoint}/${slot.id}/book?requestId=${selected.requestId}`)) {
                        setSelected(null);
                        setNotice('Lesson booked.');
                      }
                    }}>Confirm booking</button>
                    <button className={button} type="button" disabled={busy} onClick={() => setSelected(null)}>Back</button>
                  </div>
                ) : <button className={button} type="button" disabled={busy}
                  aria-label={`Book lesson at ${display.format(new Date(slot.startsAt))}`}
                  onClick={() => {
                    setSelected({ slotId: slot.id, requestId: crypto.randomUUID() });
                    setNotice('');
                    setError('');
                  }}>Book</button>}
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="upcoming-heading" className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 id="upcoming-heading" className="text-lg font-semibold">Upcoming lessons</h3>
        {bookings?.length === 0 && <p>No lessons are booked yet.</p>}
        {!!bookings?.length && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {bookings.map((booking) => (
              <li key={booking.id} className="py-3">
                <p>{display.formatRange(new Date(booking.startsAt), new Date(booking.endsAt))}</p>
                {booking.studentReference && <p className="break-all text-sm">Student ID {booking.studentReference}</p>}
                {!teacher && (cancelling === booking.id ? (
                  <div className="mt-2 space-y-2">
                    <p>
                      {booking.cancellationChargeApplies
                        ? 'This is the lesson day in the teacher’s time zone. Cancelling will count as a paid lesson.'
                        : 'You can cancel without a charge before the lesson day in the teacher’s time zone.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={button} disabled={busy} onClick={async () => {
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
                      }}>{booking.cancellationChargeApplies ? 'Cancel and accept charge' : 'Confirm cancellation'}</button>
                      <button type="button" className={button} disabled={busy}
                        onClick={() => setCancelling(null)}>Keep lesson</button>
                    </div>
                  </div>
                ) : <button type="button" className={`mt-2 ${button}`} disabled={busy}
                  aria-label={`Cancel lesson at ${display.format(new Date(booking.startsAt))}`}
                  onClick={() => { setCancelling(booking.id); setNotice(''); setError(''); }}>Cancel lesson</button>)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
