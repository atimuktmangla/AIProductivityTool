import type { RawActivity } from '../../types/index.js';
import { getConfig } from '../config/env.js';

export function computeReviewDepth(
  activities: RawActivity[],
  authorSlug: string,
): number {
  const BOT_PATTERN = new RegExp(getConfig().botUserPattern, 'i');
  const REVIEW_ACTIONS = new Set<RawActivity['action']>(['COMMENTED', 'REVIEWED', 'APPROVED']);

  return activities.filter((a) => {
    if (!REVIEW_ACTIONS.has(a.action)) return false;
    if (a.user.name === authorSlug) return false;
    if (BOT_PATTERN.test(a.user.name)) return false;
    return true;
  }).length;
}
