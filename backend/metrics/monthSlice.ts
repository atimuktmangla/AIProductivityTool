import { formatLocalDate } from './windowKind.js';

/** First day of the current calendar month (local). */
export function startOfCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Current month refresh range: month start through today. */
export function currentMonthDateRange(): { startDate: string; endDate: string } {
  return { startDate: startOfCurrentMonth(), endDate: formatLocalDate(new Date()) };
}

/** True when stored row needs a current-month or window-end merge. */
export function needsGapRefresh(
  cachedEndDate: string,
  requestedEndDate: string,
  cachedMonth: string | null,
): boolean {
  if (cachedEndDate < requestedEndDate) return true;
  const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  return cachedMonth !== null && cachedMonth !== nowMonth;
}
