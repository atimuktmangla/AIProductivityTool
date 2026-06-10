export type WindowKind = 'fixed' | 'rolling-90';

const ROLLING_DAYS_MIN = 89;
const ROLLING_DAYS_MAX = 91;

/** Rolling 90-day preset: end is today (local) and span is ~90 days. */
export function detectWindowKind(startDate: string, endDate: string): WindowKind {
  if (!isTodayLocal(endDate)) return 'fixed';
  const spanDays = daySpanInclusive(startDate, endDate);
  if (spanDays >= ROLLING_DAYS_MIN && spanDays <= ROLLING_DAYS_MAX) {
    return 'rolling-90';
  }
  return 'fixed';
}

export function isTodayLocal(isoDate: string): boolean {
  const today = formatLocalDate(new Date());
  return isoDate === today;
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daySpanInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Next calendar day after an ISO date string. */
export function nextIsoDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return formatLocalDate(d);
}

export function currentMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
