import { createHmac, timingSafeEqual } from 'node:crypto';

function avatarUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  try {
    const url = new URL(value);
    return url.origin === 'https://t.me' && !url.username && !url.password &&
      /^\/i\/userpic\//.test(url.pathname) ? url.href : null;
  } catch {
    return null;
  }
}

function profileName(value: unknown) {
  return typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim() : '';
}

export function verifyTelegramProfile(initData: string, botToken: string, now: number) {
  const fields = new URLSearchParams(initData);
  if (new Set(fields.keys()).size !== fields.size) return null;

  const hash = fields.get('hash');
  const authDate = fields.get('auth_date');
  const rawUser = fields.get('user');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !authDate || !/^\d+$/.test(authDate) || !rawUser) return null;

  const age = now - Number(authDate);
  if (age < -30 || age > 300) return null;

  fields.delete('hash');
  fields.sort();
  const data = [...fields].map(([key, value]) => `${key}=${value}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', key).update(data).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  try {
    const user: unknown = JSON.parse(rawUser);
    if (typeof user !== 'object' || user === null || !('id' in user)) return null;
    const fields = user as Record<string, unknown>;
    const { id, username } = fields;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
    const name = [profileName(fields.first_name), profileName(fields.last_name)].filter(Boolean).join(' ');
    return {
      id: BigInt(id),
      telegramName: [...name].slice(0, 120).join('') || null,
      telegramUsername: typeof username === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(username) ? username : null,
      telegramAvatarUrl: avatarUrl(fields.photo_url),
      telegramProfileAt: new Date(Number(authDate) * 1000),
    };
  } catch {
    return null;
  }
}

export type TelegramProfile = NonNullable<ReturnType<typeof verifyTelegramProfile>>;
