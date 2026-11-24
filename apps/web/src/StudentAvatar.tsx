import { useState } from 'react';
import { Icon } from './ui';

export function StudentAvatar({ name, url }: { name?: string | null; url?: string | null }) {
  const [failed, setFailed] = useState<string>();
  const initials = name?.trim().replace(/^@/, '').split(/\s+/).slice(0, 2)
    .map((word) => [...word][0]).join('').toLocaleUpperCase('ru-RU');
  return (
    <span className="student-avatar" aria-hidden="true">
      {url && failed !== url
        ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(url)} />
        : initials || <Icon name="students" />}
    </span>
  );
}
