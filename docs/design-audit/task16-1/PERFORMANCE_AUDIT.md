# Task 16.1 — Latency Audit (measured)

> Every number below comes from a real run on this machine (2026-10-01 06:07–06:20, machine clock, +0800). Nothing is estimated.
> Environment: `next dev` (Next 16.3.7) · `http://localhost:3000` · real FUYAO / DEEPSEEK keys from `.env.local`.
> Both the data layer and the LLM adapter use `cache: "no-store"` (`src/lib/data/fuyao.ts`, `src/lib/ai/model.ts`),
> so there is no application-level cache: "warm" here only means TCP/TLS and dev-mode compilation are warm.

## 0. Method

- Client: a ~90-line Node script (`fetch` + `performance.now()`, kept outside the repo), strictly sequential, single client.
  One warm-up call per endpoint (excluded), then 4 recorded runs each; single re-checks and probes were done with `curl.exe`.
- Bodies: `POST /api/research/init` `{"stockCode":"000333.SZ"}`; `dimension`
  `{"stockCode":"000333.SZ","dimensionText":"库存与周转压力","currentDimensions":[the 6 real labels returned by init]}`;
  `followup` `{"stockCode":"000333.SZ","question":"经营性现金流与净利润的变化为什么不同步？","evidenceIds":[4 real ids taken from the init response]}`.
  All requests sent `-H 'Content-Type: application/json'`; all responses were 200.
- Probes: `/api/debug/stock-data`, `/api/debug/evidence`, and `/api/followup` with `evidenceIds: []` (built-in "no focus evidence"
  early return) to isolate the pre-LLM truth layer.
- Instrumentation added by this task: a **development-only** `Server-Timing` header on the 4 API routes
  (`NODE_ENV !== "production"`; header only — body, status and behaviour unchanged; `tests/ai/followup.test.ts` 5/5 and
  the research pipeline tests 54/54 still pass). `total` = route entry → `NextResponse.json` constructed;
  `framer`/`composer`/`framing`/`synthesis` = the pipeline's own `runLLM` `latencyMs`.

## 1. Endpoint results (n=4, milliseconds)

| Endpoint | min | median | max |
|---|---|---|---|
| `GET /api/stocks/search?q=招商银行` | 76 | **81** | 128 |
| `POST /api/research/init` `000333.SZ` (Midea) | 16661 | **16830** | 22412 |
| `POST /api/research/init` `600036.SH` (CMB) | 13197 | **15571** | 19151 |
| `POST /api/research/dimension` (库存与周转压力) | 1600 | **1829** | 1897 |
| `POST /api/followup` | 6009 | **8023** | 11336 |

Cold vs warm: first `init` 16930ms vs the next three 16661–16730ms (+1.4% — no material cold penalty; the route had already been
used in this server session). For `search`, the first call of the session took 353ms (route compile; recorded as warm-up), then
128ms, then a steady 76–81ms. Client-side total exceeds `Server-Timing total` by ~10–20ms (network + harness overhead).

## 2. Where the time goes

| Stage (real names from the source) | Location | Measured? |
|---|---|---|
| ① `loadTruth()`: `Promise.all([gatherStockData, gatherMarketContext, gatherEventContext])`, then `calculateMetrics` + `buildEvidence` + `buildFinancialTrend` (sync) | `src/lib/research/init-space.ts:76` | Indirect: `/api/debug/stock-data` 167–286ms, `/api/debug/evidence` 207–500ms (warm); followup pre-LLM early return 260–384ms |
| ② `buildContextFromTruth()` → `computeCapabilityManifest` + `buildCompanyContext` (sync) | `init-space.ts:141` | Not measured separately |
| ③ `runFramer()`: LLM call #1, task `planner`, `research_framer_v1`, maxTokens 2000, one repair retry allowed | `init-space.ts:157` | **Measured** (`framer`) |
| ④ capability mapping → `matchEvidenceByCapabilities` → `buildDimensionPack` → `applyTotalBudget` (sync) | `init-space.ts:359` | Not measured separately |
| ⑤ `runComposer()`: LLM call #2, task `diagnosis_synthesis`, `research_composer_v1`, maxTokens 3000, includes `validateDimensionClaims` and one repair retry | `init-space.ts:243` | **Measured** (`composer`) |
| ⑥ assembling `dimensions`/`claims`/`evidence` + JSON serialization (measured response body 54–62KB) | `init-space.ts:391` | Not measured separately |

### 2.1 Per-run split for init (ms; residual = total − framer − composer)

| total | framer | composer | residual | note |
|---|---|---|---|---|
| 16930 | 3741 | 6966 | 6223 | framer retries=1 (verified in the saved body) |
| 16661 | 4000 | 7131 | 5530 | — |
| 16730 | 3848 | 7450 | 5432 | — |
| 22412 | 3618 | 5709 | 13085 | — |
| 19151 | 4304 | 7514 | 7333 | CMB |
| 17232 | 3778 | 7458 | 5996 | CMB |
| 13197 | 5190 | 7443 | 564 | CMB |
| 13910 | 2944 | 6442 | 4524 | CMB (AI produced only 5 dimensions) |
| 24377 | 3755 | 6166 | 14456 | re-measure window |
| 17135 | 3368 | 7330 | 6437 | re-measure window |
| 24493 | 3770 | 6391 | 14332 | re-measure window |
| 12670 | 5250 | 7052 | 368 | re-measure window |
| 12212 | 4054 | 7595 | 563 | framer r=0, composer r=0 (no retry) |
| 18030 | 5501 | 5147 | 7382 | composer retries=1 |
| 13310 | 5266 | 7293 | 751 | framer r=0, composer r=0 (no retry) |

### 2.2 What dominates

- **The two LLM stages dominate `init`.** On the two runs with confirmed zero retries,
  (framer+composer)/total = **95.4%** (12212ms) and **94.4%** (13310ms); another no-retry run measured 97.1% (12670ms).
  The composer costs ~1.9× the framer (median 7049ms vs 3795ms).
- **The residual is dominated by the un-timed first attempt of a repair retry.** Across the 4 runs whose retry state I verified:
  the 2 runs with a retry had residuals of 7382/6223ms, the 2 without had 563/751ms. `runFramer`/`runComposer` in
  `init-space.ts` (and `runFollowup` in `src/lib/ai/followup.ts`) write **only the final attempt's** `latencyMs` into the trace when
  a repair happens, so the failed first attempt never appears in the reported numbers. This attribution is supported by the code
  path, the trace semantics and those 4 runs — it was **not** directly instrumented (the module is frozen), so treat it as an
  inference, not a measurement.
- The truth layer (Fuyao fetches) is **0.17–0.6s warm** and is not the dominant cost; the `dimension` endpoint's residual is only
  0.25–1.2s, which agrees.
- `followup`: reported `synthesis` (final attempt) median 2908ms while median total is 8023ms; its pre-LLM path measured only
  260–384ms, so its gap lands on the same un-timed LLM attempts.
- Reliability observations (not latency): 2 of 6 followup calls returned `ai.status="failed"` (synthesis rejected by the grounding
  validator); 1 of the 11 init calls with a known status returned `partial_failure` (composer failed even after repair; only 5
  dimensions produced).

### 2.3 §22 candidate: independent stages that are sequential today (NOT changed in this task)

- `gatherMarketContext()` (`src/lib/data/industry.ts:200–204`) awaits `fetchCsi300Prices()` and only then
  `fetchIndustryContextData(stockCode)`. The two have no data dependency and could be `Promise.all`-ed without changing semantics.
- Everything else is already parallel where it is independent: the three `loadTruth` gathers, `gatherStockData`'s four domains,
  `fetchFinancial`'s cashflow + two indicator calls, `gatherEventContext`'s three domains, and the industry prices + valuations pair.
- framer → composer is causally sequential (the composer consumes the frame), so it **cannot** be parallelized without changing semantics.

## 3. Not measured / unknown

- Per-call breakdown inside the truth layer (basic / financial / valuation / prices / market / events); `src/lib/data` is outside
  the allowed edit scope.
- The individual cost of stages ②④⑥ (context build, packing, validation, serialization).
- The exact composition of the residual (inferred in 2.2); `retries` was not recorded for 7 of the init runs.
- LLM token counts, time-to-first-token, DeepSeek-side queueing.
- Production-mode timings (dev server only; dev-compile overhead appears only in the warm-up call).
- Concurrency behaviour: every run was sequential from a single client; simultaneous inits were not tested.
- Browser-side render/hydration cost of the payload; the 400 / 503 / compliance_redirect branches are not instrumented.

## 4. Trustworthiness of this measurement window

- **Another process was editing this repo during the window** (`src/lib/v5/switch-guard.ts`, `src/components/v5/ResearchCanvas.tsx`,
  mtimes 06:08–06:11) and may have been driving the app. The measured routes do not import those modules, and all 20 measured
  calls returned 200.
- From 06:06–06:07 the dev server returned 500 for every route because of a compile error in a v5 component (unrelated to this
  task). No data was taken during that period; the server recovered afterwards.
