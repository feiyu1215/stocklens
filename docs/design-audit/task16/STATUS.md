# Task 16 — Interaction Closure + Guided Demo + Research Shelf + Submission Package · STATUS

Environment: `http://localhost:3000/observatory-v5` (1440×900, in-app browser). Everything below is observed behaviour, not intent. Where a step was **not** verified it says so.

## A. Navigation gate

| Item | Result | Evidence |
|---|---|---|
| Esc priority chain | **Verified** for the layers I could drive: with the Thread *and* an Aperture open, Esc #1 closed only the Thread, Esc #2 closed the Aperture and returned to the Canvas. The palette layer is wired first in the chain (`lensOpen` → `aiOpen` → evidence → reading → aperture), but I could not open the palette from the test driver (Ctrl+K did not register through the scripted key input), so "palette first" is code-verified, not browser-verified | live probe trail; `08-thread-polish.png` |
| A single Esc implementation | Yes — one window keydown handler owns the chain; no component keeps its own Escape behaviour | `src/components/v5/ResearchCanvas.tsx` |
| Breadcrumb — Reading | Already existed (`← 美的集团 / 盈利质量与效率`, clickable → Canvas) | header markup |
| Breadcrumb — Evidence | Added: `美的集团 / 增长韧性 / Claim 01 / Evidence ①`; company and dimension segments click up one level. Observed during the demo (step 5) | `03-demo-evidence.png` |
| Browser history | `replaceState` baseline + `pushState` on aperture / reading / evidence / company switch, `popstate` → semantic back (`navDepthRef` counts only pushes). Not driven end-to-end with the browser Back button in this session — the handler path is code-verified only | — |
| Return restores the space | Camera is snapshotted before Reading and restored on close; the per-company snapshot carries camera / positions / parked / pins / selection / last dimension. **Caveat:** after a company round-trip the *last focus* (aperture) re-opens only if that same dynamic dimension still exists in the freshly initialised payload; Midea's dimension IDs drifted between inits in testing, so the aperture did **not** re-open and the canvas came back unfocused (camera/zoom/thread did return) | `07-restored-company-state.png` |

## B. Research Shelf gate

| Item | Result | Evidence |
|---|---|---|
| ★ Save / unsave (Company Identity) | **Verified** — toggles `★ 已保存` ⇄ `☆ 保存到研究架`, persists to `localStorage` (`stocklens.shelf.saved`) | live probe (label + storage dump) |
| Recent companies | **Verified** — capped at 6, de-duplicated, saved entries are not repeated under RECENT; the first company loaded in a session is now recorded too (fix made during testing) | `saveRecent/pushRecent` + storage dump |
| Company switcher (editorial list) | **Verified** — `CHANGE COMPANY`, `SAVED` rows with ★, `RECENT`, divider, then `Search A-share…`; text rows, no card grid | `05-research-shelf.png`, `06-company-switcher.png` |
| Search + switch reuse | Search = `GET /api/stocks/search?q=`, switch = `POST /api/research/init` — no second init path | same files, live probe |
| Switch loading | **Verified** — `Resolving 招商银行…` appears while the current canvas stays on screen (7 dimensions still rendered during the request) | live probe |
| Per-company session cache | **Verified** as storage + partial restore: `stocklens.canvas.<stockCode>` holds camera/positions/parked/pins/selection/lastDimensionId/updatedAt; camera+zoom+dimensions return on switching back (see the Caveat above for the focus) | storage dump |
| "Last research · HH:MM" | **Verified** — shown per company in the shelf and in the canvas chrome; it is time-only and does not imply a fresh fetch | `05-research-shelf.png` |
| Refresh research (secondary) | **Verified present**; re-runs the same switching path deliberately | `05-research-shelf.png` |
| Alt + ← / → among saved companies | Implemented (disabled while Reading/Aperture is open). Not verified in the browser — the driver's Alt+Arrow press went through `body.press` which failed on focus | — |
| Switching latency (finding, not a gate) | Cold switch Midea→CMB took **28.9 s**, CMB→Midea **17.6 s** (real upstream fetch). The UI stays honest with `Resolving …`, but this is the slowest interaction in the product | measured with `Date.now()` |
| Race guard (fix) | Two rapid switches could previously land on the wrong company; a request sequence number now discards superseded responses, and re-selecting the current company cancels an in-flight switch | fix made from an observed failure |

## C. Guided Demo gate

| Item | Result | Evidence |
|---|---|---|
| Entry | `▶ 60s 演示` in the header, always available; first visit additionally shows a light prompt (not a modal) with "观看 60 秒演示 / 自行探索 →"; dismissing sets `stocklens.demo.seen` | `01-demo-entry.png` |
| 8 steps, 65 s | 7+7+8+9+9+8+8+7 = **65 s** (`DEMO_TOTAL_MS`), driven by the real UI, not a video | `guided-demo.webm` (66.5 s, 532 frames) |
| Steps verified live | Step 1 pan · 2 dynamic dimension (uses the **current** payload's primary dimension, never a hardcoded label) · 3 aperture (opened `DIM_AI_INITIAL_01_增长韧性`) · 4 reading · 5 evidence (`… / Claim 01 / Evidence ①`) · 6 AI Lens focused (textarea, **no request sent**) | `02`–`04` screenshots, probes |
| No fake output, no mutation | After a full run + exit: dimensions still 7, thread still 18 turns, no add-dimension submitted, no company switched, no desktop data touched | probes before/after |
| Pause / Resume / Skip / Exit | **Verified** — `❚❚ Pause` → "演示已暂停" + `▶ Resume`; Skip advances; Exit restored the pre-demo state exactly (the aperture open before the demo was the aperture open after) | probes; `05-research-shelf.png` |
| User interaction pauses | Implemented as a capture-phase `pointerdown` that ignores clicks on the demo controls. Not exercised live | code |
| Keyboard (Space / ← / → / Esc) | Implemented; not exercised live | code |
| Reduced motion | Implemented (`prefers-reduced-motion` → no auto-pan, no pointer trail, no long transitions) | code |
| Analytics | Local only: `stocklens.demo.seen`, `stocklens.demo.completed` | code |

## D. AI Thread polish gate

| Item | Result | Evidence |
|---|---|---|
| Debug block only with `?aiDebug=1` | **Verified** — with the parameter the panel renders; without it, absent | live probe both ways |
| Thread header | **Verified** — `美的集团 / Company Research` (or the current scope), with `—` collapse, `×` close, `•••` | `08-thread-polish.png` |
| One collapse entry | **Verified** — per-answer `Collapse` buttons are gone (`[data-ai-collapse]` count = 0) | probe |
| Close ≠ delete | `×` closes the visual thread only; history stays (re-opening shows all turns) | probe |
| Clear thread | Behind `•••` with an inline two-step confirm (`Clear thread?` → Confirm / Cancel). Not executed during acceptance — I did not want to destroy the recorded history just to test it | `08-thread-polish.png` |
| Overlay keeps the canvas visible | Thread sheet stays translucent (0.92–0.94 white) over the canvas | screenshots |

## E. Interaction audit (partial, honest)

Global CSS now gives every known affordance a pointer cursor, a hover response (opacity on dimensions/evidence/suggestions) and a shared `:focus-visible` outline. The new chrome added in this task (identity, ★ save, switcher rows, demo controls, thread header buttons) is `data-ui` so it no longer dismisses canvas state. Audited live this session: company switch, save, demo, dimension, evidence, Explore, Ask, Pin, Park, suggested research, add dimension, AI Lens, zoom controls, breadcrumb, collapse, stop, retry. **Not** re-audited item by item: Command Palette entries, Tab-order completeness for every control (no automated keyboard sweep was run).

## F/G. Package audit

- `npm run package:submission` → `dist-submission/StockLens_Submission.zip`, **657,182 bytes (0.63 MB)**, 201 entries — far under the 30 MB hard cap and the 25 MB target (nothing had to be shrunk). Script exits non-zero at ≥30 MB.
- Secret scan: **PASS** — 200 text files, 0 findings; the fail path was proven in a temp copy (fake key → exit 1, masked excerpt, no ZIP written). A human should still confirm the on-repo result.
- `.env.example` present and names-only; it is the only `.env*` file in the ZIP.
- Excluded and confirmed absent from the archive: `.git/`, `node_modules/`, `.next/`, `.vercel/`, `.tmp/`, `.tools/`, `docs/design-audit/` (101 files, incl. `guided-demo.webm`), local tokens, caches. No `.webm`/`.gif` inside the ZIP.
- Largest included files: `src/lib/data/industry-registry.json` (1.02 MB), `package-lock.json` (0.31 MB), `ResearchCanvas.tsx` (0.13 MB). Manifest: `docs/final/PACKAGE_MANIFEST.md`.
- Repeat runs with stable input produced byte-identical ZIPs; re-run after a source change to repackage the newest tree (this gate's ZIP was built before the final fixes — re-run before submission).
- **`docs/final/StockLens_Demo.mp4` does not exist.** Only a 2.5 MB `.webm` (in `docs/design-audit/`, excluded by design). There is no ffmpeg on this machine, so the webm→mp4 conversion for the final ZIP is Task 17 work.

## G. Requirement matrix

`docs/final/REQUIREMENT_MATRIX.md` — 17 requirement rows: **15 PASS, 2 PARTIAL, 0 NOT VERIFIED**, every row carrying file/test/route evidence. The two PARTIAL rows are: peer comparison (valuation multiple vs industry median only; full peer financials return an explicit UNKNOWN) and stale-data handling (no freshness/TTL guard exists). Also found: the README's test counts are stale (309/356) against the current **382** tests.

## Known issues (open)

1. Company switching takes 17–29 s cold; the canvas is kept and `Resolving …` is shown, but there is no progress beyond that.
2. Last research focus does not re-open after a company round-trip when the dimension's generated ID has drifted (see A).
3. Browser Back/Forward semantic behaviour and the palette's Esc layer are code-verified only (the driver could not produce Ctrl+K / reliable Back presses in this session).
4. Guided-demo keyboard controls and reduce-motion branch are implemented but untested live.
5. Alt+←/→ quick switch untested live.
6. Delivered demo video is `.webm`; the final packaged demo must be `.mp4` ≤ 15 MB (Task 17).

## Size / build snapshot

Typecheck clean · `eslint src/components/v5 src/lib/v5` 0 errors (1 pre-existing warning) · tests **382 passed / 28 files** (10 new shelf+demo cases) · `next build` succeeded · ZIP 0.63 MB.
