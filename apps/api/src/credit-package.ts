export type PackageTerms = { validThrough: string; timeZone: string };

export function packageExpiry({ validThrough, timeZone }: PackageTerms): Date | null {
  const utcDate = new Date(`${validThrough}T00:00:00.000Z`);
  if (!Number.isFinite(utcDate.getTime()) || utcDate.toISOString().slice(0, 10) !== validThrough ||
      utcDate.getUTCFullYear() < 1970 || utcDate.getUTCFullYear() > 9998 || /^[+-]/.test(timeZone)) return null;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en', {
      calendar: 'iso8601', numberingSystem: 'latn', timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch {
    return null;
  }
  const dateAt = (stamp: number) => {
    const fields = formatter.formatToParts(stamp);
    const part = (type: Intl.DateTimeFormatPartTypes) => fields.find((field) => field.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  const day = 86_400_000;
  let after = utcDate.getTime() + 2 * day;
  const step = 30 * 60_000;
  let before = after - step;
  // Scan backwards so a clock change near midnight does not end the package early.
  while (before > utcDate.getTime() - day && dateAt(before) > validThrough) {
    after = before;
    before -= step;
  }
  while (after - before > 1) {
    const pivot = Math.floor((before + after) / 2);
    if (dateAt(pivot) > validThrough) after = pivot;
    else before = pivot;
  }
  return dateAt(before) === validThrough ? new Date(after) : null;
}
