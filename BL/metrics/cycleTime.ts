const MS_PER_HOUR = 3_600_000;
const WORK_START_HOUR = 9;  // 09:00 local
const WORK_END_HOUR   = 17; // 17:00 local

// 2.75 leaves/holidays per resource per month = 33 per year.
// There are ~261 workdays/year → 33/261 ≈ 12.6% of workdays are non-working.
// Applied as a multiplier: effective working hours = raw * (1 - 0.1264)
const LEAVE_DISCOUNT = 33 / 261; // ~0.1264

// Returns effective working hours (Mon–Fri, 09:00–17:00) between two epoch-ms timestamps,
// discounted for an average of 2.75 leave/holiday days per month per developer.
// Returns 0 if the PR is unmerged (mergedMs is null/undefined).
export function computeCycleTimeHrs(createdMs: number, mergedMs: number | null | undefined): number {
  if (!mergedMs || mergedMs <= createdMs) return 0;

  let cursor = new Date(createdMs);
  let rawHours = 0;

  while (cursor.getTime() < mergedMs) {
    const day = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      const workStart = new Date(cursor);
      workStart.setHours(WORK_START_HOUR, 0, 0, 0);
      const workEnd = new Date(cursor);
      workEnd.setHours(WORK_END_HOUR, 0, 0, 0);

      const windowStart = Math.max(cursor.getTime(), workStart.getTime());
      const windowEnd   = Math.min(mergedMs, workEnd.getTime());

      if (windowEnd > windowStart) {
        rawHours += (windowEnd - windowStart) / MS_PER_HOUR;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  const effectiveHours = rawHours * (1 - LEAVE_DISCOUNT);
  return Math.round(effectiveHours * 100) / 100;
}

// Pickup delay: elapsed working hours between PR creation and first reviewer interaction.
export function computePickupDelayHrs(
  createdMs: number,
  firstReviewerActionMs: number | null,
): number {
  if (!firstReviewerActionMs || firstReviewerActionMs <= createdMs) return 0;
  return computeCycleTimeHrs(createdMs, firstReviewerActionMs);
}

// Review lifecycle: elapsed working hours between first comment and merge.
export function computeReviewLifecycleHrs(
  firstCommentMs: number | null,
  mergedMs: number | null | undefined,
): number {
  if (!firstCommentMs || !mergedMs || mergedMs <= firstCommentMs) return 0;
  return computeCycleTimeHrs(firstCommentMs, mergedMs);
}
