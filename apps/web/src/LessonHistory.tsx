import { useEffect, useState } from 'react';
import { LessonTime } from './LessonTime';
import { LessonMoves, type LessonMove } from './LessonMoves';
import { Badge, EmptyState, LoadingState, Notice } from './ui';

type Record = {
  id: string; startsAt: string; endsAt: string; cancelledAt: string | null;
  cancellationReason?: string | null;
  moves?: LessonMove[];
  status: 'COMPLETED' | 'CANCELLED_BY_STUDENT' | 'CANCELLED_BY_TEACHER';
};
const day = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full' });
const statuses = {
  COMPLETED: 'Проведено', CANCELLED_BY_STUDENT: 'Отменено вами', CANCELLED_BY_TEACHER: 'Отменено преподавателем',
};

export function LessonHistory({ token, revision }: { token: string; revision: number }) {
  const [lessons, setLessons] = useState<Record[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/schedule/bookings/history', {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error();
      const records: Record[] = await response.json();
      if (!controller.signal.aborted) {
        setLessons(records);
        setFailed(false);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [revision, token]);

  return (
    <section className="list-section" aria-labelledby="lesson-history">
      <h2 id="lesson-history">История занятий</h2>
      {failed && <Notice tone="danger">Не удалось загрузить историю. Обновите расписание.</Notice>}
      {!lessons && !failed && <LoadingState label="Загружаем историю занятий…" />}
      {lessons?.length === 0 && <EmptyState icon="lessons" title="История пока пуста">
        Здесь появятся проведённые и отменённые занятия.
      </EmptyState>}
      {!!lessons?.length && (
        <>
          <p className="muted">До 30 последних записей</p>
          <ul className="lesson-cards">
            {lessons.map((lesson) => (
              <li key={lesson.id} className="item-row lesson-card">
                <div>
                  <p className="item-title">{day.format(new Date(lesson.startsAt))}</p>
                  <p className="muted"><LessonTime {...lesson} /></p>
                  {lesson.cancellationReason && <p className="muted">Причина: {lesson.cancellationReason}</p>}
                </div>
                <Badge>{statuses[lesson.status]}</Badge>
                {!!lesson.moves?.length && <LessonMoves moves={lesson.moves} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
