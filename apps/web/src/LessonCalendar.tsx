import { useState } from 'react';
import { Button, Icon, IconButton } from './ui';

const shortDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const fullDay = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' });
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function localDateKey(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function shiftDay(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days, 12);
}

export function LessonCalendar({ selected, onSelect, marked }: {
  selected: Date; onSelect: (value: Date) => void; marked: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const today = new Date();
  const todayKey = localDateKey(today);
  const selectedKey = localDateKey(selected);
  const month = new Date(selected.getFullYear(), selected.getMonth() + monthOffset, 1, 12);
  const first = expanded ? month : shiftDay(selected, -((selected.getDay() + 6) % 7));
  const empty = expanded ? (month.getDay() + 6) % 7 : 0;
  const count = expanded ? new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate() : 7;

  function select(value: Date) {
    onSelect(value);
    setMonthOffset(0);
    setExpanded(false);
  }

  return (
    <section className="lesson-calendar" aria-label="Календарь занятий">
      <div className="calendar-toolbar">
        <Button variant="quiet" className="calendar-toggle" aria-expanded={expanded} aria-controls="lesson-calendar-days"
          onClick={() => { setMonthOffset(0); setExpanded(!expanded); }}>
          <Icon name="schedule" />
          <span>{monthLabel.format(expanded ? month : selected)}</span>
          <Icon name={expanded ? 'up' : 'down'} />
        </Button>
        <div className="actions calendar-arrows">
          <IconButton icon="left" label={expanded ? 'Предыдущий месяц' : 'Предыдущая неделя'} variant="quiet"
            onClick={() => expanded ? setMonthOffset((value) => value - 1) : select(shiftDay(selected, -7))} />
          <IconButton icon="right" label={expanded ? 'Следующий месяц' : 'Следующая неделя'} variant="quiet"
            onClick={() => expanded ? setMonthOffset((value) => value + 1) : select(shiftDay(selected, 7))} />
        </div>
      </div>
      <div className="calendar-grid" id="lesson-calendar-days">
        {expanded && weekdays.map((day) => <span className="calendar-weekday" key={day} aria-hidden="true">{day}</span>)}
        {Array.from({ length: empty }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: count }, (_, index) => {
          const day = shiftDay(first, index);
          const key = localDateKey(day);
          const hasEntries = marked.has(key);
          return <button key={key} type="button" className="calendar-day" aria-pressed={key === selectedKey}
            aria-current={key === todayKey ? 'date' : undefined}
            aria-label={`${fullDay.format(day)}${hasEntries ? ', есть занятия или свободное время' : ''}`}
            onClick={() => select(day)}>
            {!expanded && <span className="calendar-weekday">{shortDay.format(day)}</span>}
            <span className="calendar-number">{day.getDate()}</span>
            <span className={hasEntries ? 'calendar-dot calendar-dot--marked' : 'calendar-dot'} aria-hidden="true" />
          </button>;
        })}
      </div>
      <div className="section-tools calendar-footer">
        <strong>{fullDay.format(selected)}</strong>
        {selectedKey !== todayKey && <Button variant="quiet" onClick={() => select(today)}>Сегодня</Button>}
      </div>
    </section>
  );
}
