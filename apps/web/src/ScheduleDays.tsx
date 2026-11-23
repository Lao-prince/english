import type { ReactNode } from 'react';

const dateKey = new Intl.DateTimeFormat('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit' });
const dayHeading = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const full = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

type Timed = { id: string; startsAt: string; endsAt: string };

export function LessonTime({ startsAt, endsAt }: Pick<Timed, 'startsAt' | 'endsAt'>) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return <time dateTime={startsAt}>{dateKey.format(start) === dateKey.format(end)
    ? clock.formatRange(start, end) : full.formatRange(start, end)}</time>;
}

export function ScheduleDays<T extends Timed>({ items, heading: Heading = 'h3', renderRow }: {
  items: T[]; heading?: 'h2' | 'h3'; renderRow: (item: T) => ReactNode;
}) {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const key = dateKey.format(new Date(item.startsAt));
    const day = days.get(key);
    if (day) day.push(item);
    else days.set(key, [item]);
  }
  return <div className="schedule-days">
    {[...days].map(([key, day]) => (
      <div key={key}>
        <Heading className="schedule-day-title">{dayHeading.format(new Date(day[0].startsAt))}</Heading>
        <ul className="item-list">{day.map(renderRow)}</ul>
      </div>
    ))}
  </div>;
}
