import { useEffect, useState, type FormEvent } from 'react';
import { Button, EmptyState, Field, IconButton, LoadingState, Notice } from './ui';
import { CreditLedger } from './CreditLedger';

type Student = { id: string; displayName: string | null; telegramId: string | null; createdAt: string };
const endpoint = '/api/students';
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' });

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
          setFeedback({ tone: 'danger', text: 'Не удалось загрузить список. Обновите его и попробуйте снова.' });
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
      setFeedback({ tone: 'success', text: 'Имя сохранено.' });
      setRevision((value) => value + 1);
    } catch {
      setFeedback({ tone: 'danger', text: 'Не удалось сохранить имя. Попробуйте ещё раз.' });
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
        <h2 id="roster-heading">Список учеников</h2>
        <IconButton icon="refresh" label="Обновить список" variant="quiet" disabled={saving}
          onClick={() => {
            setFeedback(null);
            setRevision((value) => value + 1);
          }} />
      </div>
      {!!students?.length && <Field label="Поиск учеников">
        <input type="search" placeholder="Имя или ID в Telegram" value={query} onChange={(event) => setQuery(event.target.value)} />
      </Field>}
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
      {students === null && !feedback && <LoadingState label="Загружаем список…" />}
      {students?.length === 0 && <EmptyState icon="students" title="Учеников пока нет">
        Здесь появятся ученики после принятия приглашения или ручного добавления.
      </EmptyState>}
      {!!students?.length && visible?.length === 0 && <EmptyState icon="students" title="Никого не нашли">
        Попробуйте другое имя или ID в Telegram.
      </EmptyState>}
      {!!visible?.length && (
        <ul className="item-list">
          {visible.map((student) => (
            <li key={student.id} className="item-row">
              <div>
                <p className="item-title">{student.displayName ?? 'Ученик без имени'}</p>
                {student.telegramId && <p className="muted">ID в Telegram: {student.telegramId}</p>}
                <p className="muted">Аккаунт создан <time dateTime={student.createdAt}>{dateFormat.format(new Date(student.createdAt))}</time></p>
              </div>
              {editing?.id === student.id ? (
                <form className="confirmation" onSubmit={save}>
                  <Field label="Имя ученика">
                    <input maxLength={80} disabled={saving} value={editing.name}
                      onChange={(event) => setEditing({ id: student.id, name: event.target.value })} />
                  </Field>
                  <div className="actions">
                    <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить имя'}</Button>
                    <Button variant="quiet" disabled={saving} onClick={() => setEditing(null)}>Отмена</Button>
                  </div>
                </form>
              ) : <div className="actions"><Button disabled={saving} onClick={() => {
                setFeedback(null);
                setEditing({ id: student.id, name: student.displayName ?? '' });
              }}>Изменить имя</Button>
                <Button aria-expanded={creditsFor === student.id}
                  onClick={() => setCreditsFor(creditsFor === student.id ? null : student.id)}>Баланс</Button>
              </div>}
              {creditsFor === student.id && <div className="confirmation"><CreditLedger token={token} studentId={student.id} /></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
