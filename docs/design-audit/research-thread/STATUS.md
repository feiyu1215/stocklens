# Task 15.4B — Research Thread State Machine · STATUS

Scope of this gate: the AI Research Thread inside `/observatory-v5` — three forms (collapsed / expanded / thinking), history, scroll ownership, per-company threads, one active generation, Stop ≠ Collapse, Retry (never a fake "Continue"), frozen scope per turn, sessionStorage persistence, dimension links back to the Canvas.

All statements below are what was actually observed in a browser on `http://localhost:3000/observatory-v5?aiDebug=1` (1440×900), not intent.

## 1. Acceptance scenarios — what was observed

| # | Scenario | Observed result | Evidence |
|---|---|---|---|
| A | History visible (not just stored) | After 17 turns and a full page reload the thread re-opens by itself and is scrolled to the newest turn (`turns=17`, `scrollTop = scrollHeight − clientHeight = 433`) | `01-thread-history.png` |
| B | Scroll stability (thread scroll ≠ canvas zoom; no forced auto-scroll) | With the thread at `scrollTop = 60`, sending a new question left `scrollTop = 60` unchanged and showed `[data-ai-new]` "↓ New response"; a real mouse wheel over the thread moved `scrollTop` 40 → 148 while canvas zoom stayed 100% | `02-thread-scroll.png` |
| C | Stop | Clicking `■ Stop` while `followup: in-flight` produced `[data-ai-stopped]` "Stopped by you" + Retry answer + Edit question; UI control returned within ~0.9 s | `05-stopped-state.png` |
| D | Collapse while running | `Escape` hid the thread while the debug line still read `followup: in-flight` (generation kept running); clicking the composer re-opened the thread with the turn included | `04-collapsed-running.png` |
| E | Dimension switching while a turn runs | An answer's dimension link (`data-ai-dimlink`) opened the aperture on `DIM_USER_99_海外业务收入结构` and moved the AI scope to `scope: dimension …`, with the running turn untouched | `07-dimension-context-switch.png`, `10-ai-to-canvas-link.png` |
| F | Company switching | Switching to `600036.SH` while 美的 had an unfinished turn produced the cross-company capsule `✓ 美的集团 · Answer ready` (`[data-ai-capsule]` + `[data-ai-answer-ready]`); clicking it returned to 美的集团 with all 17 turns intact; `sessionStorage` held only `stocklens.thread.000333.SZ` throughout → threads are per company | `08-background-company-job.png`, `09-answer-ready.png` |
| G | Retry with frozen scope | Retrying a stopped turn re-issued the same question with the scope recorded on that turn (dimension/company chip unchanged), and the turn moved to a normal answer | `06-retry.png` |

## 2. Backend facts (asked for explicitly — answered honestly)

- **Does the backend stream?** **No.** `POST /api/research/followup` returns one atomic JSON body. The "Reviewing N evidence objects…" capsule is a local progress state, not token streaming; there is no SSE/streaming endpoint in this build.
- **Does AbortController guarantee upstream cancellation?** **Unknown / not guaranteed.** Aborting cancels the browser request; the API has no cancel endpoint and no server-side job id, so whether a model call already in flight is stopped upstream cannot be asserted from the client. The UI therefore says only "Stopped by you".
- **Is a real resume supported?** **No.** A stopped turn can be Retried (a brand-new request) but never resumed; there is no partial answer to continue from.
- **Does the backend receive the conversation history?** **No.** Each request sends only the question plus the scope's `evidenceIds`; the thread itself lives entirely in the client.
- **Persistence:** `sessionStorage` under `stocklens.thread.<stockCode>` (one key per company), written on every thread change, read once on mount. It ends with the browser session; nothing is stored server-side.
- **Scope freezing:** the question, scope type/label, `dimensionId`/`claimId` and the `evidenceIds` snapshot are frozen into the turn when it is sent (`frozenQuestion`, `createdAt`). If the scope changes later, the thread inserts a `CONTEXT CHANGED → <label>` separator instead of rewriting old turns.

## 3. Defects found during acceptance and fixed in this gate

1. **Forced auto-scroll while reading history** — the follow logic read a state value captured in the effect's closure, so an up-scrolled thread was still yanked to the bottom. Replaced with a `atBottomRef` written by the scroll handler; the new-response path now only sets `↓ New response`.
2. **Sticky suggestions covered Retry/Stop** — the suggestion chips (`z-[55]`) rendered above the thread and intercepted the click on "Retry answer" (Playwright actionability error). Suggestions now only render when that company has no history.
3. **Collapse was a dead end** — after `Escape` the textarea stayed focused, so clicking it fired no `focus` event and the thread could not be re-opened. The composer now opens on `pointerdown`, and `Escape` blurs the input.
4. **Restored history was invisible** — a reload reloaded the turns but left the thread collapsed. On restore the thread now opens and follows the newest turn.

## 4. Video artifact — not delivered, and why

`research-thread-flow.webm` is **missing**. Three capture attempts were made (live capture with the flow driven from outside; capture with `actions` scripted into the recorder):

- two live sessions produced empty 306 ms / 405 ms clips (the in-app browser pane is throttled in the background, so no frames were produced);
- the scripted `actions` run ended `status: "failed"`.

No substitute file was fabricated. `01`–`10` are real viewport screenshots from the runs described above. If a recording is required for the review, it should be taken with the browser pane in the foreground (or with a Playwright/CDP recorder) — that is an environment limit of this session, not of the product.

## 5. Known limitations / open items

- The cross-company capsule only covers *other* companies. A same-company run that is collapsed shows nothing beyond the composer's `■ Stop` state — there is no "still thinking" pill in the collapsed form.
- The thread panel is a floating 640 px sheet over the canvas; it visually overlaps anchors beneath it (translucent white, 0.94 opacity). No layout collision handling was implemented for that overlap.
- Turn timestamps exist in the data model (`createdAt`) and are persisted, but only the frozen scope label is rendered per turn; a visible per-turn timestamp was not added in this gate.
- Left unaddressed from the spec's wish list: nothing else — collapse/stop separation, retry-vs-continue naming, single active generation and the "one turn at a time" notice were all implemented.

## 6. Gates

`npx tsc --noEmit` clean · `npx eslint src/components/v5` 0 errors (2 pre-existing warnings) · `npx vitest run` 372 passed / 27 files · `npx next build` succeeded.

`15.4B` gate items: history visible ✓ · history scrollable ✓ · no canvas zoom while scrolling the thread ✓ · no forced auto-scroll when reading history ✓ · Stop reachable ✓ · Stop returns UI control immediately ✓ · Retry works ✓ · Collapse does not stop generation ✓ · AI runs while the Canvas stays usable ✓ · scope frozen per turn ✓ · company threads isolated ✓ · answer-ready background state works ✓ · `.webm` ✗ (see §4).
