# RELEASE GATE — Task 16.2

**Status: Task 16.2B complete. READY FOR TASK 17.**

The interaction manifest reaches **PASS 47 · FAIL 0 · NOT TESTED 0 · PARTIAL 0** (one row is `NOT APPLICABLE` with an explicit scope reason). The 16.2A critical gates B1–B5 remain PASS and were not re-litigated. Duplicate `research/init` remains fixed — every uncached switch in this round issued exactly one `init`.

**Verification builds:** `3809567` · `63e2d84` · `1835581` · `4d2a5fd` (16.2A) → `6e79c2b` · `dd9d5c6` · `2dce14e` · `db618d4` (16.2B). All 16.2B evidence is against `db618d4` on the production alias.

## 16.2B — what the sweep found and fixed

The Round-16.2A lesson was that a control can be visible, `isVisible() === true`, and still be unreachable by a real pointer. The remaining rows were hiding four more of that family:

| Fix | Defect | Evidence |
|---|---|---|
| `6e79c2b` | The suggested-angle block was pinned at world `y = 806` of a 900-tall world. On any viewport shorter than ~810 px it fell below the fold — at 1280×720 only **11 %** of it was on screen and its click centre was outside the viewport. Moved to `y = 700`, which is inside the visible band at 1280×720, 1280×800 and 1440×900. | `visibleFraction 11 %` → **100 %** at all three sizes |
| `dd9d5c6` | The suggestion's `onPointerDown` called `setPointerCapture` on its **parent element**, so the browser retargeted `pointerup`/`click` to the capture element and the trigger button's `onClick` **never fired** — the rationale popover was unreachable. Capture is now taken lazily, only once a drag actually passes the 5 px threshold. | click target `SPAN` inside the button → popover opens |
| `2dce14e` | With the popover opening **downward**, its `Add to research` button landed at `y = 737` in a 720-tall viewport. The popover now opens **upward** (`bottom-full`), so it stays inside the viewport at every height ≥ ~400 px. | Add button `y 737 (outside)` → **`y 566–602 (inside, hit-testing itself)`** |
| `db618d4` | `ReadingV3` registered its own `window` Escape handler that called `onBack()` — so with the AI thread open, Escape **closed the Reading sheet and left the thread open**, exactly inverting the documented single chain (Demo → Palette → Thread → Evidence → Reading → Aperture → Canvas). Added the optional `escOwnedByParent` prop (v5 passes it) so Reading only handles its own local state and defers the sheet exit to the global chain. | open thread + Reading → Escape → **thread closed, Reading kept**; then Escape → evidence unpinned → Escape → aperture → Escape → Canvas |

## Gate status

| Gate | Status |
|---|---|
| duplicate `research/init` | **PASS** — one `init` per uncached switch and per refresh, counted from Resource Timing across every 16.2B run |
| B1 Guided Demo V2 | **PASS** (16.2A) — plus Pause/Resume/Skip, interruption auto-pause and the Space/←/→/Esc keys verified this round |
| B2 Full-Screen Transition | **PASS** (16.2A) — appearance 3–4 ms, cancel reachable 50/50, restore 3 ms, no late overwrite at 30 s |
| B3 Cached Company Restore | **PASS** (16.2A) — five-item scene identical, `init ×0`, 15.8 ms |
| B4 Failure States | **PASS** (16.2A) — three injected failures with Retry/Back, non-production only |
| B5 Console / Network | **PASS** — 0 uncaught, 0 `console.error`, 0 React, 0 hydration across every run of both rounds |

## Console / network discipline

Across this round's runs: **0 uncaught exceptions, 0 React runtime errors, 0 hydration errors**.

Two warnings appeared and are classified as **external, not application output**:

- `[RUM] ArmsEventBridge is not available, events dropped` — appears only when a browser extension injects its monitoring SDK. The string exists in neither `src/` nor the served HTML.

No unexpected business requests were observed: the local spatial operations (marquee, Gather, Spread, Focus selected, Clear selection, Park/Restore, zoom, aperture, Reading navigation, evidence pinning, palette commands) all changed the `/api/` request set **not at all**.

## Scope note — 390×844

The product is a 1440×900 desktop research canvas. At 390×844 the required non-spatial bar is met (no blank screen, no horizontal overflow, AI Lens reachable), but the spatial interactions are out of supported scope: the camera floor `MIN_SCALE 0.65` cannot fit the 1440-wide world into 390 px, so all six dimensions render off-screen, and the first-use hint card overlaps the Company Identity control. This is recorded as `NOT APPLICABLE` with the measurements rather than papered over. Chasing a phone-width canvas was explicitly declined by the product owner during this round.

## Not in this round

Task 17 owns: README, root-route switch, final screenshots, the demonstration video, the production smoke re-run, the secret scan and the final ZIP — which must be rebuilt because `dist-submission/StockLens_Submission.zip` predates all 16.2A/16.2B commits.
