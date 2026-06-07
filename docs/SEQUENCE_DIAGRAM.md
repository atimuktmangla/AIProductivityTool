# Sequence Diagrams — AI Productivity Tool

---

## 1. Dashboard Load (`GET /api/dashboard/users`)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as UI (React)
    participant Filter as FilterPanel / UserPicker
    participant WEB as WEB / metricsRouter
    participant DB_bb as DB / bitbucketService
    participant BB as Bitbucket Server

    User->>UI: Open dashboard in browser
    UI->>Filter: mount
    Filter->>WEB: GET /api/dashboard/users
    WEB->>DB_bb: getAllUsers()
    loop paginate admin/users
        DB_bb->>BB: GET /rest/api/1.0/admin/users?limit=1000&start=N
        BB-->>DB_bb: BitbucketPagedResponse<BitbucketUser>
    end
    DB_bb-->>WEB: BitbucketUser[]
    WEB-->>Filter: 200 JSON array
    Filter->>UI: render searchable user list
```

---

## 2. Project & Repo Picker Load

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Filter as FilterPanel / RepoPicker
    participant WEB as WEB / metricsRouter
    participant DB_bb as DB / bitbucketService
    participant BB as Bitbucket Server

    Filter->>WEB: GET /api/dashboard/projects
    WEB->>DB_bb: getAllProjects() (or return env BITBUCKET_PROJECT_KEYS)
    DB_bb->>BB: GET /rest/api/1.0/projects
    BB-->>DB_bb: project list
    DB_bb-->>WEB: string[]
    WEB-->>Filter: 200 ["DOSC","PLATFORM",...]

    User->>Filter: select project pills
    Filter->>WEB: GET /api/dashboard/repos?projectKeys=DOSC
    WEB->>DB_bb: getReposForProject("DOSC")
    DB_bb->>BB: GET /rest/api/1.0/projects/DOSC/repos
    BB-->>DB_bb: repo list
    DB_bb-->>WEB: RepoEntry[]
    WEB-->>Filter: 200 [{projectKey,repoSlug},...]
    Filter->>UI: render repo checkboxes
```

---

## 3. Metrics Request (`POST /api/dashboard/metrics`)

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as UI (React)
    participant Hook as useDashboard
    participant WEB as WEB / metricsRouter
    participant Guard as Guardrails (rate-limiter + sanitiser)
    participant BL_cfg as BL / config (env.ts)
    participant BL_agg as BL / aggregator
    participant BL_ct as BL / cycleTime
    participant BL_rd as BL / reviewDepth
    participant BL_wt as BL / workType
    participant DB_bb as DB / bitbucketService
    participant DB_jira as DB / jiraService
    participant DB_http as DB / atlassianFetch
    participant BB as Bitbucket Server
    participant JIRA as Jira Server

    User->>UI: Select team + date range + (optional) projects/repos → Run report
    UI->>Hook: fetchMetrics()
    Hook->>WEB: POST /api/dashboard/metrics {developerIds, startDate, endDate, projectKeys?, repoTargets?}

    WEB->>Guard: check rate limit
    Guard-->>WEB: pass (or 429 Too Many Requests)

    WEB->>Guard: sanitise + validate payload
    Guard-->>WEB: validated DashboardQueryPayload (or 400 Bad Request)

    WEB->>BL_cfg: getConfig()
    BL_cfg-->>WEB: AppConfig (cached)

    WEB->>BL_agg: aggregateMetrics(payload)

    BL_agg->>BL_agg: resolveRepoTargets(payload, config)
    note over BL_agg: Tier 1 → exact pairs, Tier 2 → project list, Tier 3 → profile/recent/repos

    note over BL_agg: Fan-out: Promise.all per developer

    par for each developer in developerIds
        BL_agg->>DB_bb: getCommitsByAuthor(proj, repo, devId, start, end) [resolved repos]
        loop paginate commits (early-exit on authorTimestamp < sinceMs)
            DB_bb->>DB_http: atlassianGet()
            DB_http->>BB: GET /rest/api/1.0/projects/{p}/repos/{r}/commits?author=X
            BB-->>DB_http: BitbucketPagedResponse<RawCommit>
            DB_http-->>DB_bb: RawCommit[]
        end
        DB_bb-->>BL_agg: RawCommit[] (date-filtered in-memory)

        BL_agg->>BL_agg: extract Jira keys via /([A-Z]+-\d+)/g

        par fetch Jira issues (two paths)
            BL_agg->>DB_jira: getIssuesByKeys(keys[])
            DB_jira->>DB_http: atlassianPost()
            DB_http->>JIRA: POST /rest/api/2/search {jql: "key in (...)"}
            JIRA-->>DB_http: JiraSearchResponse
            DB_http-->>DB_jira: RawJiraIssue[]
            DB_jira-->>BL_agg: RawJiraIssue[] (commit-linked)
        and
            BL_agg->>DB_jira: searchIssuesByAssignees([devId], start, end)
            loop paginate JQL search
                DB_jira->>DB_http: atlassianPost()
                DB_http->>JIRA: POST /rest/api/2/search {jql: "assignee in (...)"}
                JIRA-->>DB_http: JiraSearchResponse
                DB_http-->>DB_jira: RawJiraIssue[]
            end
            DB_jira-->>BL_agg: RawJiraIssue[] (assignee-based)
        end

        BL_agg->>BL_agg: deduplicate issues by issue.key (Map)

        BL_agg->>DB_bb: getMergedPullRequestsByAuthor(proj, repo) [resolved repos]
        loop paginate MERGED PRs (authored)
            DB_bb->>DB_http: atlassianGet()
            DB_http->>BB: GET /rest/api/1.0/projects/{p}/repos/{r}/pull-requests?state=MERGED&author={slug}
            BB-->>DB_http: BitbucketPagedResponse<RawPullRequest>
            DB_http-->>DB_bb: RawPullRequest[]
        end
        DB_bb-->>BL_agg: RawPullRequest[] (filtered: author + date window)

        BL_agg->>DB_bb: getMergedPRsParticipatedByUser(proj, repo, devId, startDate) [resolved repos]
        loop paginate MERGED PRs (participated)
            DB_bb->>DB_http: atlassianGet()
            DB_http->>BB: GET /rest/api/1.0/projects/{p}/repos/{r}/pull-requests?state=MERGED&role=PARTICIPANT&username={slug}
            BB-->>DB_http: BitbucketPagedResponse<RawPullRequest>
            DB_http-->>DB_bb: RawPullRequest[]
        end
        DB_bb-->>BL_agg: RawPullRequest[] (others' PRs where dev participated)
        BL_agg->>BL_agg: deduplicate by pr.id → prsReviewed count

        note over BL_agg: Fan-out: Promise.all per PR

        par for each authored PR
            BL_agg->>DB_bb: getPRActivities(proj, repo, prId)
            DB_bb->>BB: GET .../pull-requests/{id}/activities
            BB-->>DB_bb: RawActivity[]
            DB_bb-->>BL_agg: RawActivity[]

            BL_agg->>DB_bb: getPRDiffStat(proj, repo, prId)
            DB_bb->>BB: GET .../pull-requests/{id}/diff
            BB-->>DB_bb: DiffResponse
            DB_bb-->>BL_agg: RawDiffStat
        end

        BL_agg->>BL_ct: computeCycleTimeHrs(createdMs, closedMs)
        BL_ct-->>BL_agg: cycleTimeHrs (leave-adjusted)

        BL_agg->>BL_ct: computePickupDelayHrs(createdMs, firstReviewerMs)
        BL_ct-->>BL_agg: pickupDelayHrs

        BL_agg->>BL_ct: computeReviewLifecycleHrs(firstCommentMs, closedMs)
        BL_ct-->>BL_agg: reviewLifecycleHrs

        BL_agg->>BL_rd: computeReviewDepth(activities, devId)
        BL_rd-->>BL_agg: reviewDepth (bot-filtered)

        BL_agg->>BL_wt: classifyWorkType(issueTypeName, labels) [per issue]
        BL_wt-->>BL_agg: WorkCategory

        BL_agg-->>BL_agg: build AggregatedDeveloperMetric
    end

    BL_agg-->>WEB: AggregatedDeveloperMetric[]

    WEB-->>Hook: 200 JSON AggregatedDeveloperMetric[]
    Hook->>UI: dispatch FETCH_SUCCESS
    UI->>User: render ThroughputOverview + WorkflowCycleTrack + WorkTypeChart + ContributorTable
```

---

## 4. Error Flow

```mermaid
sequenceDiagram
    autonumber
    participant WEB as WEB / metricsRouter
    participant DB_http as DB / atlassianFetch
    participant BB as Bitbucket Server
    participant EH as WEB / errorHandler

    WEB->>DB_http: atlassianGet(...)
    DB_http->>BB: HTTP request
    BB-->>DB_http: 401 Unauthorized

    DB_http->>DB_http: toAtlassianError() → AtlassianHttpError(401, ...)
    DB_http-->>WEB: throw AtlassianHttpError

    WEB->>EH: next(err)
    EH->>EH: instanceof AtlassianHttpError + status 401
    EH-->>WEB: res.status(502).json({ error: "Upstream authentication failure", detail: "..." })
    WEB-->>UI: 502 + JSON error body
```

---

## 5. Request lifecycle (middleware stack)

```mermaid
sequenceDiagram
    autonumber
    participant Client as Browser / API client
    participant RID as Middleware: requestId
    participant Log as Middleware: requestLogger
    participant RL as Guardrail: rateLimiter
    participant San as Guardrail: sanitiser
    participant Route as WEB / metricsRouter
    participant EH as WEB / errorHandler

    Client->>RID: any HTTP request
    RID->>RID: attach X-Request-Id (uuid or existing header)
    RID->>Log: next()
    Log->>Log: log method + path + requestId + timestamp
    Log->>RL: next()
    RL->>RL: check IP token bucket (express-rate-limit)
    alt over limit
        RL-->>Client: 429 Too Many Requests
    else within limit
        RL->>San: next()
        San->>San: strip unknown fields, trim strings
        San->>Route: next()
        Route->>Route: handle request
        Route-->>Log: res.on("finish") log status + duration
        Route-->>Client: 200 / 4xx response
    end

    note over EH: catches any unhandled throw from Route
    Route->>EH: next(err) on exception
    EH-->>Client: 500 / 502 JSON error
```

---

## 6. Sync Job Trigger Flow (`POST /api/dashboard/sync/trigger`)

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant UI as UI (SyncPage)
    participant Hook as useSync
    participant SR as WEB / syncRouter
    participant Job as jobs / metricsSync
    participant Cache as DB / metricsCache
    participant BL as BL / aggregator
    participant BB as Bitbucket Server
    participant JIRA as Jira Server

    Admin->>UI: Select users + schedule → Save & Run
    UI->>Hook: saveAndRun()

    opt purgeLogsOnRun
        Hook->>SR: DELETE /api/dashboard/sync/logs
        SR->>Job: purgeRunLogs()
        SR-->>Hook: 204 No Content
    end

    opt schedule = daily or weekly
        Hook->>SR: POST /api/dashboard/sync/config {developerIds, intervalMinutes}
        SR->>Job: rescheduleInterval(intervalMinutes, developerIds)
        SR-->>Hook: 200 SyncConfig
    end

    Hook->>SR: POST /api/dashboard/sync/trigger {developerIds}
    SR->>SR: validate developerIds
    SR->>Job: triggerSyncForUsers(developerIds) — non-blocking
    SR-->>Hook: 202 { queued: true }

    Hook->>SR: GET /api/dashboard/sync/status
    SR->>Job: getSyncStatus()
    SR-->>Hook: { running: true, ... }
    Hook->>UI: update status badge → Running

    note over Job: Runs asynchronously in the background

    Job->>Job: runSync(developerIds)
    Job->>Job: read data/sync-config.json (override check)

    loop for each batch of 10 users
        Job->>BL: aggregateMetrics({ developerIds: batch, ... })
        BL->>BB: commits + PRs + activities
        BL->>JIRA: issues by assignee + key
        BL-->>Job: AggregatedDeveloperMetric[]
        Job->>Cache: setCachedMetrics(batch, metrics)
        Cache->>Cache: write data/cache/metrics-result/{devId}__{start}__{end}.json
    end

    Job->>Job: write data/sync-logs/{timestamp}.json
    Job->>Job: running = false; lastRunAt = now

    Hook->>SR: GET /api/dashboard/sync/status (5s poll)
    SR-->>Hook: { running: false, lastRunAt: ... }
    Hook->>UI: update status badge → Idle

    Hook->>SR: GET /api/dashboard/sync/logs
    SR-->>Hook: SyncRunLog[]
    Hook->>UI: render run history table
```

---

## 7. Partial Cache Hit Flow (`POST /api/dashboard/metrics`)

```mermaid
sequenceDiagram
    autonumber
    participant UI as UI (Dashboard)
    participant MR as WEB / metricsRouter
    participant Cache as DB / metricsCache
    participant BL as BL / aggregator
    participant BB as Bitbucket Server
    participant JIRA as Jira Server

    UI->>MR: POST /metrics { developerIds: [A, B, C], startDate, endDate }

    MR->>Cache: getCachedMetrics([A, B, C], start, end, TTL=1h)

    Cache->>Cache: read data/cache/metrics-result/A__{start}__{end}.json → fresh
    Cache->>Cache: read data/cache/metrics-result/B__{start}__{end}.json → fresh
    Cache->>Cache: read data/cache/metrics-result/C__{start}__{end}.json → absent

    Cache-->>MR: { hits: [metricA, metricB], misses: ["C"], oldestCachedAt: ... }

    note over MR: Partial hit — compute only developer C

    MR->>BL: aggregateMetrics({ developerIds: ["C"], startDate, endDate })
    BL->>BB: commits + PRs + activities for C
    BL->>JIRA: issues for C
    BL-->>MR: AggregatedDeveloperMetric (C)

    MR->>MR: merged = [metricA, metricB, metricC]
    MR-->>UI: 200 { current: merged, cacheStatus: "partial", cachedAt: oldestCachedAt }

    UI->>UI: render metrics + show green cache banner "Partial cache hit"
```
