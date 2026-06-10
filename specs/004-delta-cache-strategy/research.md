# Research: Delta Cache Strategy

## Decision 1: TTL default 0

**Decision**: `METRICS_CACHE_TTL_MS` default `0` means no age-based expiry.  
**Rationale**: User requirement; sync days ago must remain valid.  
**Alternative rejected**: 30-day TTL — still fails 5-day scenario at scale.

## Decision 2: Rolling-90 key

**Decision**: Store one row per `(developer_id, window_kind='rolling-90')`; DELETE+INSERT on write.  
**Rationale**: Rolling calendar dates change daily; exact PK breaks hits.  
**Alternative rejected**: Normalize start/end to Monday buckets — loses precision.

## Decision 3: Window-end merge

**Decision**: When cached `end_date < requested end_date`, run aggregation for gap only and merge.  
**Rationale**: Avoids full 90-day recompute while picking up last N days.  
**Alternative rejected**: Always full re-aggregate on any date drift — too many API calls.

## Decision 4: Delta envelopes

**Decision**: Mirror merged-PR envelope pattern for open/reviewed/Jira under `data/cache/{month}/`.  
**Rationale**: Consistent with 003; closed months write-once.  
**Alternative rejected**: In-memory cursors only — lost on restart.

## Decision 5: Refresh endpoint

**Decision**: `POST /sync/refresh` body `{ developerIds?, scope: 'current-month' | 'full' }`.  
**Rationale**: Operator escape hatch without new config surface.
