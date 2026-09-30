# KNOWN BUGS

Every item below was actually seen (or measured). Items marked NOT VERIFIED were not reproduced after the fix.

## Found by the 16.2A real-pointer audit and fixed in this round

| # | Severity | Observed | Status |
|---|---|---|---|
| 10 | **MAJOR (control unreachable)** | `[data-transition-cancel]` — the 「← 返回上一层公司」 button the code comment promises is “始终可用” — could not be clicked by a real pointer. The sibling `<div className="absolute inset-0 …">` content layer paints above it and is hit-testable, so **0 of 50 sampled points** inside the button resolved to the button. Clicking it produced no `pointerdown` at all and the transition stayed up until the server answered. | **FIXED** `3809567` — content layer is `pointer-events-none`; the failure-state button row re-enables `pointer-events-auto` so Retry / 返回上一家公司 stay clickable. Re-verified: **50/50** samples reachable, cancel restores in 3 ms. |
| 11 | **MAJOR (control unreachable)** | `[data-demo-finish]` — the demo's closing CTA 「开始研究 →」 — sat inside the demo overlay's `pointer-events-none` layer (`getComputedStyle(btn).pointerEvents === "none"`), so the final frame could not be dismissed by its own button. Only the small `Exit` control worked. | **FIXED** `63e2d84` — the final-frame card sets `pointer-events-auto`. Re-verified: `pointerEvents: auto`, topmost element at the CTA centre is the BUTTON, and clicking it restores the pre-demo scene. |
| 12 | **MAJOR (blocks a workflow)** | The first-use hint `[data-demo-prompt]` (`absolute right-8 top-20 z-[62] w-[300px]`, `x 948–1248 / y 80–210`) sits on top of the Company Switcher panel (`x 908–1248 / y 64–294`, `z-index: auto` inside the `z-50` header context). It covered **92 % of the SAVED / RECENT row width**, so a first-time user could not click any recent company — the row's `elementFromPoint` resolved to the hint. | **FIXED** `1835581` — the passive hint hides while the switcher is open (`companyQuery === null` added to its render condition). Re-verified: `promptHiddenWhenSwitcherOpen: true`, RECENT row clickable, cached restore measured at 15.8 ms. |
| 13 | MINOR | Switching from a **search result** showed the stock code where the company name belongs (transition header read `600036.SH ... 600036.SH`). | **FIXED** `0ad691e` — the result row passes `{ name: r.stockName }`. Re-verified in production: transition target reads **招商银行**. |

## Earlier items

| # | Severity | Observed | Status |
|---|---|---|---|
| 1 | CRITICAL (for automation, not for users) | After switching companies, a leftover `readingId` kept the header in Reading mode: breadcrumb for a dimension that no longer exists, Company Identity / ★ / 更换公司 / ▶ 演示 invisible, and every scripted flow failed before it started. | **FIXED**; not observed in this round's runs (the audit completed without hitting it). |
| 2 | MAJOR | The uncached company switch waited 15–29 s with the old canvas apparently unchanged (the “click → frozen → sudden final page” pattern). | **FIXED and VERIFIED IN BROWSER** — B2 PASS: 3–4 ms to the full-screen transition, real elapsed seconds, cancel restores in 3 ms. |
| 3 | MAJOR | Two rapid company selections could land on the wrong company (the later-arriving response wins). | **FIXED** — request sequence guard (`src/lib/v5/switch-guard.ts`) with 2 unit tests. |
| 4 | MAJOR (backend truthfulness) | `runFramer` / `runComposer` / `runFollowup` report only the final attempt's `latencyMs` when a repair retry happens, so a failed first attempt is invisible (residual 5.4–14.5 s on retry runs vs 0.37–0.75 s retry-free). | **REPORTED, NOT FIXED** (`src/lib/research/` is frozen for this task). |
| 5 | MINOR | README test counts are stale (309/356) against the current 385. | OPEN — Task 17 owns README. |
| 6 | MINOR | Suggestion chips used to cover the thread's Retry/Stop buttons (z-index). | **FIXED** — suggestions render only when the company thread is empty. |
| 7 | MINOR | Collapsing the thread with Escape used to be a dead end (the composer stayed focused so clicking it fired no focus event). | **FIXED** — composer opens on pointerdown; Escape blurs. |
| 8 | MINOR | `gatherMarketContext` (`src/lib/data/industry.ts:200-204`) awaits CSI300 and industry context sequentially although they are independent. | REPORTED, NOT CHANGED (§22 measure-first). |
| 9 | MINOR | `TrendGlyph` is defined and never used (lint warning). | OPEN |

## New, found in this round, not fixed

| # | Severity | Observed | Note |
|---|---|---|---|
| 14 | MINOR (copy) | The first-use hint reads 「观看 **60** 秒演示」 but Guided Demo V2 is 6 scenes / **50 s** (`DEMO_TOTAL_MS = 50000`). | One-word copy fix; Task 17 owns copy. |
| 15 | MINOR (dead feedback) | `cancelSwitch` sets `cancelNotice("已取消等待")`, but `pendingCompany` is nulled in the same commit so the transition unmounts immediately — the notice element never renders. The user gets no confirmation that the wait was cancelled. | `notice={switchMorph ? null : cancelNotice}` is only reachable in the success-morph path. |
| 16 | MINOR (persistence) | A full page reload does **not** apply the saved canvas snapshot: `sessionStorage["stocklens.canvas.000333.SZ"]` held `camera.scale = 1.25` and a moved dimension, yet the page came back at 100 % with default positions. (The AI thread *does* restore from `stocklens.thread.*`.) The boot path writes `payloadCacheRef` but never calls `applySession`, and dimension IDs are regenerated per init so stored positions would not map anyway. | Within-session cached restore works (B3 PASS); only the reload path is inert. |
| 17 | MINOR (layer fragility) | The Company Switcher lives inside the `z-50` header stacking context, so *any* overlay at `z ≥ 55` can cover it — today only `[data-demo-prompt]` did (#12), fixed by hiding the hint rather than by re-layering. `?perfDebug=1` (`z-[70]`) and `?aiDebug=1` (`z-[75]`) panels overlap the same corner in debug builds. | Worth a deliberate stacking policy if a fourth surface is ever added to that corner. |
| 18 | OBSERVED ONCE, NOT REPRODUCED | After an uncached switch, `localStorage["stocklens.shelf.recent"]` contained only the new company — 美的集团 was gone from RECENT. Five subsequent runs wrote `["600036.SH","000333.SZ"]` correctly, including a run with a `localStorage.setItem` tracer that logged the exact sequence. `recordVisit` reads `recentCompanies` from its render closure, so a stale closure is the only mechanism found, but no reproduction was achieved. | If it reappears: log every `setItem` on `stocklens.shelf.recent` (the tracer snippet is in the audit notes) and check whether it lands before or after the boot effect's `requestAnimationFrame` push. |

## Deliberate behaviour, not a bug

- `Retry answer` on a failed AI turn **appends a new turn** and leaves the failed one in the thread. This is the 15.4B state machine's “**Retry 非 Continue**” decision, not a regression.
- The generated dimension IDs (`DIM_AI_INITIAL_04_行业相对表现` etc.) differ on every `init` because the model authors them. Cached switches do not re-init, so the IDs are stable exactly where the restore path depends on them.
