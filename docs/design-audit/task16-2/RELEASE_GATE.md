# RELEASE GATE — Task 16.2

**Status: the six gates now have real-browser evidence. READY FOR 16.2B review — NOT READY FOR TASK 17.**

This round ran the audit the previous session could not. Every gate below was executed against the production alias (`https://stocklens-blush.vercel.app/observatory-v5?live=1`) or, for B4 only, against a local dev server — the failure injection is non-production by construction.

Three real defects were found by this audit and fixed in this round (see `KNOWN_BUGS.md` #10–#12). Two of them made a promised control **unreachable by a real pointer**; the third let a passive hint cover the company switcher. All three are the class of defect only a real-pointer gate finds.

**Verification builds:** `0ad691e` (search-name fix) → `3809567` (transition pointer-events) → `63e2d84` (demo CTA) → `1835581` (prompt overlap) → `4d2a5fd` (non-prod failure injection). B1/B2/B3/B5 evidence is against `1835581`/`4d2a5fd`; B4 is against the same tree on localhost.

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| duplicate `research/init` | **PASS** | An uncached switch issues exactly one `init`. Counted from Resource Timing: boot `14 878 ms`, then switch `19 691 ms` — no third entry, in two independent runs. |
| B1 Guided Demo V2 | **PASS** | Full 6-scene run from a clean first-use state. Progress `1/6 → 6/6` at the authored cadence (5000/6000/7000/12000/8000/12000 ms). Scene 6 order confirmed: `close-reading` → add-angle visible → shelf visible, in that order. Zero business requests for the whole demo. Final frame rendered; the CTA is now clickable; Exit restored all 6 dimension positions, zoom, aperture, Reading, add-angle and shelf state exactly. |
| B2 Full-Screen Transition | **PASS** | Real pointerdown → transition in the DOM in **3–4 ms**. `position: fixed`, `z-index: 110`, covers 1280×720. Target identity reads **招商银行** (the §5.1 name fix). 5 neutral placeholders, true elapsed seconds, `← 返回美的集团`. Both old-canvas probe points hit the transition layer. Cancel reachable **50/50** hit samples after the fix; `cancelRestoreMs = 3 ms`; the 6-item scene comparison is identical; **30 s later** nothing was overwritten and the aborted CMB `init` shows `dur=53ms`. |
| B3 Cached Restore | **PASS** | Five items restored identically: zoom `125`, the dragged dimension `873.694px/456.4px`, the pinned note id, the AI thread, and the active aperture dimension. `init` count stayed at 2 → **zero new init**. `cachedRestoreMs = 15.8 ms`. Anchor IDs before/after are identical, so no “dynamic-id drift” explanation is needed — this path does not re-init. |
| B4 Failure States | **PASS** | `?testFailure=research-init｜dimension｜followup` implemented behind a compile-time `NODE_ENV` guard; the strings `testFailure` / `test-injected failure` are **absent from the production bundle**. `research-init` → `phase="failed"` with Retry + 返回上一家公司, both hit-tested reachable, Back restored 美的, Retry re-issued a real init (15.1 s) and recovered. `dimension` → `[data-failed-angle]` “库存压力 Unable to resolve / Retry”; Retry added the real dimension (7 → 8 anchors). `followup` → `[data-ai-failed]` “AI interpretation is temporarily unavailable. Current evidence remains available.” + Retry answer; Retry produced an answered turn (a new turn, per 15.4B “Retry 非 Continue”). |
| B5 Console / Network | **PASS** | Local interactions (dimension → aperture → Reading → evidence → AI lens focus) changed the `/api/` request set **not at all**. Console across boot + journey + switch + cached restore: **0 uncaught, 0 `console.error`, 0 `console.warn`, 0 React, 0 hydration**. Uncached switch `init ×1`; cached restore `init ×0`; dimension ×0; followup ×1; search ×1. |

## What is still NOT TESTED

`INTERACTION_MANIFEST.md` is the authoritative list. The rows still open are peripheral to the six gates:

- ⌘K Command Palette by keyboard, Shift+1 / Shift+2 fit shortcuts, Alt+←/→ shelf navigation — the driver cannot emit reliable modifier chords in this IAB build.
- Marquee select, Focus selected, Gather, Spread, Park and their follow-on operations.
- `Refresh research` (`[data-refresh-research]`) — the forced re-init path and its 「正在刷新…」 copy.
- Suggested-dimension drag-to-canvas (`[data-suggestion-trigger]`).
- The three-viewport-size matrix — this round used the IAB's 1280×720 only.
- Reduced-motion demo variant.
- Claim list / ASK / CHALLENGE inside Reading, and the Reading evidence-field cross-check.

## How the audit was executed (so the next round does not re-learn it)

- Final-gate evidence uses **real pointer input only**. `locator.click()` is unusable in this IAB build (it times out even with `force: true`); the working path is `tab.cua.click({x,y})` with coordinates from a live `getBoundingClientRect()`, plus a trusted-event assertion. Verified: `pointerdown`/`mousedown`/`mouseup`/`click` all arrive with `isTrusted: true` — browser-generated input, not `dispatchEvent` synthesis.
- `cua.click` costs ~40–500 ms on a healthy tab and ~5 s once a tab's input channel starts degrading; eventually the tab stops delivering input at all. A **fresh tab per run** with the **whole run inside one JS cell** is the only reliable pattern.
- Readiness is polled, never fixed-slept: `/api/research/init` was observed at 14.3 s, 15.1 s, 15.6 s, 19.7 s, **21.4 s, 25.2 s and 27.6 s**. A 9 s or 19.5 s sleep is not enough.
- One tab's `reload()` interacts with the app's `history` state machine (`historyState` carried `{stockCode, dim, read:true}` after a mid-switch reload), so a timed run starts from a fresh tab rather than a reload.
- Screenshots and video were not used; per the previous session's agreement the verdict rests on DOM assertions, hit tests, Resource Timing and in-page timing marks.
