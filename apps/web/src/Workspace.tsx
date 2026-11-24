import { useEffect, useRef, useState } from 'react';
import { Schedule } from './Schedule';
import { StudentInvitations } from './StudentInvitations';
import { StudentRoster } from './StudentRoster';
import { CreditLedger } from './CreditLedger';
import { fieldValidation, Icon } from './ui';

const teacherViews = [
  { id: 'lessons', label: 'Расписание', title: 'Расписание', icon: 'schedule' },
  { id: 'schedule', label: 'Слоты', title: 'Свободные слоты', icon: 'lessons' },
  { id: 'students', label: 'Ученики', title: 'Ученики', icon: 'students' },
] as const;
const studentViews = [
  { id: 'lessons', label: 'Занятия', title: 'Занятия', icon: 'lessons' },
  { id: 'schedule', label: 'Запись', title: 'Запись на урок', icon: 'schedule' },
  { id: 'subscription', label: 'Абонемент', title: 'Абонемент', icon: 'subscription' },
] as const;
type ViewId = (typeof teacherViews | typeof studentViews)[number]['id'];
const readView = () => new URLSearchParams(window.location.search).get('view');

export function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">E</span><span>English Space</span></div>;
}

export function Workspace({ teacher, token }: { teacher: boolean; token: string }) {
  const [requested, setRequested] = useState(readView);
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const allowed = teacher ? teacherViews : studentViews;
  const current = allowed.find(({ id }) => id === requested) ?? allowed[0];

  useEffect(() => {
    const restore = () => {
      moveFocus.current = true;
      setRequested(readView());
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      window.scrollTo(0, 0);
      heading.current?.focus({ preventScroll: true });
    }
  }, [current.id]);

  function viewUrl(id: ViewId) {
    const url = new URL(window.location.href);
    if (id === allowed[0].id) url.searchParams.delete('view');
    else url.searchParams.set('view', id);
    return url;
  }

  return (
    <div className="workspace">
      <header className="app-header">
        <nav className="app-nav" aria-label="Разделы приложения">
          {allowed.map(({ id, label, icon }) => (
            <a href={viewUrl(id).href} key={id} aria-current={current.id === id ? 'page' : undefined}
              onClick={(event) => {
                if (event.button || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
                event.preventDefault();
                if (id === current.id) return;
                window.history.pushState(null, '', viewUrl(id));
                moveFocus.current = true;
                setRequested(id);
              }}>
              <span className="nav-icon"><Icon name={icon} /></span><span>{label}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className="content" id="main-content" {...fieldValidation}>
        <div className="page-heading">
          <h1 ref={heading} tabIndex={-1}>{current.title}</h1>
        </div>
        <Schedule teacher={teacher} token={token} view={current.id} />
        {!teacher && current.id === 'subscription' && <CreditLedger token={token} />}
        {teacher && <div className="schedule-grid" hidden={current.id !== 'students'}>
          <StudentInvitations token={token} />
          <StudentRoster active={current.id === 'students'} token={token} />
        </div>}
      </main>
    </div>
  );
}
