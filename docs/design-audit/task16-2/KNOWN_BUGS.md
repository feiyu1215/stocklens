# KNOWN BUGS — observed during Task 16 / 16.1 / 16.1A sessions

Every item below was actually seen (or measured) in this session. Items marked NOT VERIFIED were not reproduced after the fix.

| # | Severity | Observed | Status |
|---|---|---|---|
| 1 | CRITICAL (for automation, not for users) | After switching companies, a leftover `readingId` kept the header in Reading mode: breadcrumb shown for a dimension that no longer exists, Company Identity / ★ / 更换公司 / ▶ 演示 invisible, and every scripted flow failed before it started. | **FIXED, NOT RETESTED** — header now requires a resolvable `readingDimension`; a reconcile effect clears `readingId`/evidence when the payload no longer contains that dimension. |
| 2 | MAJOR | The uncached company switch waited 15–29s with the old canvas apparently unchanged (the "click → frozen → sudden final page" pattern). | **FIXED in 16.1/16.1A** (full-screen transition + immediate target identity + neutral placeholders + cancel), **NOT VERIFIED IN BROWSER**. |
| 3 | MAJOR | Two rapid company selections could land on the wrong company (the later-arriving response wins). | **FIXED** — request sequence guard (`src/lib/v5/switch-guard.ts`) with 2 unit tests. |
| 4 | MAJOR (backend truthfulness) | `runFramer` / `runComposer` / `runFollowup` report only the final attempt's `latencyMs` when a repair retry happens, so a failed first attempt is invisible (residual 5.4–14.5s on retry runs vs 0.37–0.75s retry-free). | **REPORTED, NOT FIXED** (`src/lib/research/` is frozen for this task). |
| 5 | MINOR | README test counts are stale (309/356) against the current 385. | OPEN — Task 17 owns README. |
| 6 | MINOR | Suggestion chips used to cover the thread's Retry/Stop buttons (z-index). | **FIXED** — suggestions render only when the company thread is empty. |
| 7 | MINOR | Collapsing the thread with Escape used to be a dead end (the composer stayed focused so clicking it fired no focus event). | **FIXED** — composer opens on pointerdown; Escape blurs. |
| 8 | MINOR | `gatherMarketContext` (`src/lib/data/industry.ts:200-204`) awaits CSI300 and industry context sequentially although they are independent. | REPORTED, NOT CHANGED (§22 measure-first). |
| 9 | MINOR | `TrendGlyph` is defined and never used (lint warning). | OPEN |
