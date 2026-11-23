import { useEffect, useState, type FormEvent } from 'react';
import { Button, EmptyState, Field, IconButton, LoadingState, Notice } from './ui';
import { CreditLedger } from './CreditLedger';

type Student = { id: string; displayName: string | null; telegramId: string | null; createdAt: string };
const endpoint = '/api/students';
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function StudentRoster({ active, token }: { active: boolean; token: string }) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [creditsFor, setCreditsFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const rows: Student[] = await response.json();
        if (!controller.signal.aborted) setStudents(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFeedback({ tone: 'danger', text: 'Could not load students. Refresh to try again.' });
        }
      });
    return () => controller.abort();
  }, [active, revision, token]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`${endpoint}/${editing.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: editing.name.trim() || null }),
      });
      if (!response.ok) throw new Error();
      const student: Student = await response.json();
      setStudents((previous) => previous?.map((row) => row.id === student.id ? student : row) ?? null);
      setEditing(null);
      setFeedback({ tone: 'success', text: 'Student name saved.' });
      setRevision((value) => value + 1);
    } catch {
      setFeedback({ tone: 'danger', text: 'Could not save the student name. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  const needle = query.trim().toLocaleLowerCase();
  const visible = students?.filter((student) => student.id === editing?.id ||
    (student.displayName ?? '').toLocaleLowerCase().includes(needle) || (student.telegramId ?? '').includes(needle));

  return (
    <section className="list-section" aria-labelledby="roster-heading">
      <div className="section-tools">
        <h2 id="roster-heading">Student roster</h2>
        <IconButton icon="refresh" label="Refresh students" variant="quiet" disabled={saving}
          onClick={() => {
            setFeedback(null);
            setRevision((value) => value + 1);
          }} />
      </div>
      {!!students?.length && <Field label="Search students">
        <input type="search" placeholder="Name or Telegram ID" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Field>}
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {students === null && !feedback && <LoadingState label="Loading students…" />}
      {students?.length === 0 && <EmptyState icon="students" title="No student accounts yet">
        Students appear here when they join or are added manually.
      </EmptyState>}
      {!!students?.length && visible?.length === 0 && <EmptyState icon="students" title="No matching students">
        Try a different name or Telegram ID.
      </EmptyState>}
      {!!visible?.length && (
        <ul className="item-list">
          {visible.map((student) => (
            <li key={student.id} className="item-row">
              <div>
                <p className="item-title">{student.displayName ?? 'Unnamed student'}</p>
                {student.telegramId && <p className="muted">Telegram ID {student.telegramId}</p>}
                <p className="muted">Account created <time dateTime={student.createdAt}>{dateFormat.format(new Date(student.createdAt))}</time></p>
              </div>
              {editing?.id === student.id ? (
                <form className="confirmation" onSubmit={save}>
                  <Field label="Display name">
                    <input maxLength={80} disabled={saving} value={editing.name}
                      onChange={(event) => setEditing({ id: student.id, name: event.target.value })} />
                  </Field>
                  <div className="actions">
                    <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save name'}</Button>
                    <Button variant="quiet" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </form>
              ) : <div className="actions"><Button disabled={saving} onClick={() => {
                setFeedback(null);
                setEditing({ id: student.id, name: student.displayName ?? '' });
              }}>Edit name</Button>
                <Button aria-expanded={creditsFor === student.id}
                  onClick={() => setCreditsFor(creditsFor === student.id ? null : student.id)}>Credits</Button>
              </div>}
              {creditsFor === student.id && <div className="confirmation"><CreditLedger token={token} studentId={student.id} /></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
