import { createHmac, timingSafeEqual } from 'node:crypto';

export const sessionLifetime = 8 * 60 * 60;

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function issueSession(id: string, secret: string, now: number): string {
  const payload = `${id}.${now + sessionLifetime}`;
  return `${payload}.${sign(payload, secret).toString('hex')}`;
}

export function readSession(authorization: string | undefined, secret: string, now: number): string | null {
  const value = authorization?.match(/^Bearer ([^ ]+)$/i)?.[1];
  if (!value) return null;

  const [id, expiration, signature, extra] = value.split('.');
  if (extra !== undefined || !/^[a-f0-9-]{36}$/.test(id) || !/^\d{1,12}$/.test(expiration ?? '') ||
      Number(expiration) <= now || !/^[a-f0-9]{64}$/.test(signature ?? '')) return null;

  const expected = sign(`${id}.${expiration}`, secret);
  return timingSafeEqual(expected, Buffer.from(signature, 'hex')) ? id : null;
}
