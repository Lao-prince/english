export type LessonMove = { id: string; fromStartsAt: string; toStartsAt: string; createdAt: string };
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function LessonMoves({ moves }: { moves: LessonMove[] }) {
  return (
    <details className="confirmation muted">
      <summary>История переносов ({moves.length})</summary>
      <ul>
        {moves.map((move) => (
          <li key={move.id}>
            <p>{date.format(new Date(move.fromStartsAt))} → {date.format(new Date(move.toStartsAt))}</p>
            <p>Изменено {date.format(new Date(move.createdAt))}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
