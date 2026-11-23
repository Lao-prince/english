import { useEffect, useRef, useState } from 'react';
import { Schedule } from './Schedule';
import { StudentInvitations } from './StudentInvitations';
import { Badge, Icon } from './ui';

const views = [
  { id: 'schedule', label: 'Schedule', title: 'Schedule' },
  { id: 'lessons', label: 'Lessons', title: 'Upcoming lessons' },
  { id: 'students', label: 'Students', title: 'Students' },
] as const;
type ViewId = typeof views[number]['id'];
const readView = () => new URLSearchParams(window.location.search).get('view');

export function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">E</span><span>English Space</span></div>;
}

export function Workspace({ teacher, token }: { teacher: boolean; token: string }) {
  const [requested, setRequested] = useState(readView);
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const allowed = teacher ? views : views.slice(0, 2);
  const current = allowed.find(({ id }) => id === requested) ?? views[0];

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
    if (id === 'schedule') url.searchParams.delete('view');
    else url.searchParams.set('view', id);
    return url;
  }

  return (
    <div className="workspace">
      <header className="app-header">
        <div className="header-inner">
          <Brand />
          <nav className="app-nav" aria-label="Workspace">
            {allowed.map(({ id, label }) => (
              <a href={viewUrl(id).href} key={id} aria-current={current.id === id ? 'page' : undefined}
                onClick={(event) => {
                  if (event.button || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
                  event.preventDefault();
                  if (id === current.id) return;
                  window.history.pushState(null, '', viewUrl(id));
                  moveFocus.current = true;
                  setRequested(id);
                }}>
                <Icon name={id} /><span>{label}</span>
              </a>
            ))}
          </nav>
          <Badge>{teacher ? 'Teacher' : 'Student'}</Badge>
        </div>
      </header>
      <main className="content" id="main-content">
        <div className="page-heading">
          <h1 ref={heading} tabIndex={-1}>{current.title}</h1>
        </div>
        <Schedule teacher={teacher} token={token} view={current.id} />
        {teacher && <div hidden={current.id !== 'students'}><StudentInvitations token={token} /></div>}
      </main>
    </div>
  );
}
