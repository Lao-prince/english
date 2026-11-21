import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyTelegramId(initData: string, botToken: string, now: number): bigint | null {
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
    const { id } = user;
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? BigInt(id) : null;
  } catch {
    return null;
  }
}
