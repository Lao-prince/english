type Result =
  | { state: 'SENT' | 'FAILED' | 'UNKNOWN' }
  | { state: 'PENDING'; retrySeconds: number };

export async function sendReminder(token: string, chatId: bigint, text: string, post = fetch): Promise<Result> {
  const id = Number(chatId);
  if (!Number.isSafeInteger(id) || id <= 0) return { state: 'FAILED' };
  try {
    const response = await post(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: id, text }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    const result: unknown = await response.json().catch(() => null);
    if (!result || typeof result !== 'object' || !('ok' in result)) return { state: 'UNKNOWN' };
    if (response.ok && result.ok === true) return { state: 'SENT' };
    if (result.ok !== false || response.status >= 500) return { state: 'UNKNOWN' };
    if (response.status === 429) {
      const params = 'parameters' in result ? result.parameters : undefined;
      const seconds = params && typeof params === 'object' && 'retry_after' in params ? params.retry_after : undefined;
      return { state: 'PENDING', retrySeconds: typeof seconds === 'number' &&
        Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : 86400 };
    }
    return { state: response.status >= 400 ? 'FAILED' : 'UNKNOWN' };
  } catch {
    return { state: 'UNKNOWN' };
  }
}

export function reminderText(startsAt: Date, timeZone: string) {
  const when = new Intl.DateTimeFormat('ru-RU', {
    timeZone, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(startsAt);
  return `English Space: урок скоро начнётся.\nНачало: ${when} (${timeZone}).`;
}
