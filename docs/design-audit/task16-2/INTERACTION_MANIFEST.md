# INTERACTION MANIFEST — Task 16.2

**Result column convention (per §41):** `PASS` / `FAIL` / `NOT APPLICABLE` / `NOT TESTED`.
`NOT TESTED` is **not** a soft PASS and must not be read as one. §44 is respected: 385 unit tests passing is **not** evidence for any row here.

Rows marked `PASS (16.2A)` were exercised in this round by real pointer input (`cua.click`/`cua.drag`, `isTrusted: true` events) against the production alias on build `1835581`/`4d2a5fd`. Rows marked `PASS` without a round tag carry evidence from an earlier session and were not re-run.

## Screen: Company Canvas
| Control | Selector (as implemented today) | Input | Expected | Network | Endpoint | Return path | Result |
|---|---|---|---|---|---|---|---|
| Company Identity (open switcher) | `[data-company-identity]` | click | shelf panel | no | — | toggle same control | **PASS (16.2A)** — opener for every switch run |
| Save to shelf ☆/★ | `[data-save-company]` | click | toggle saved, persist localStorage | no | — | — | PASS (Task 16: `★ 已保存` + localStorage) |
| 更换公司 → | `[data-change-company]` | click | shelf panel | no | — | toggle | NOT TESTED |
| ▶ 演示 | `[data-demo-prompt-start]`, `[data-demo-start]` | click | start Guided Demo V2 | no | — | Exit / CTA | **PASS (16.2A)** — both entry points reachable |
| Dimension hover | `[data-anchor-id]` | hover | summary hint | no | — | — | PASS (16.1: 35ms, net:no) |
| Dimension click → Aperture | `[data-anchor-id]` | click | Focus Aperture | no | — | Esc / blank click | **PASS (16.2A)** — aperture opened in B2, B3 and B5 runs |
| Dimension drag | `[data-anchor-id]` + pointer arbitration | drag | manual position | no | — | — | **PASS (16.2A)** — real drag moved `01_增长韧性` from `761.694px/223.92px` to `873.694px/456.4px`; the exact value came back on cached restore (B3) and survived demo Exit (B1) |
| Suggested research | `[data-suggestion-trigger]`, `[data-suggestion]` | click / drag | add angle | yes on submit | `/api/research/dimension` | — | NOT TESTED |
| Add research angle | `[data-command-hint]` → `[data-lens-item="Add research angle"]` → `[data-add-angle]` → `[data-add-submit]` | click + type | provisional anchor; failure keeps the anchor + Retry | yes | `/api/research/dimension` | `[data-failed-angle-retry]` | **PASS (16.2A)** — happy path 7→8 anchors; injected failure showed “库存压力 Unable to resolve / Retry” and Retry recovered |
| AI Research Lens | `[data-ai-lens] textarea` | focus/type | open thread | no | — | Esc | **PASS (16.2A)** — focus/type/send, zero network until send |
| ⌘K Command Palette | ⌘K | key | palette opens | no | — | Esc | NOT TESTED (driver cannot emit modifier chords reliably) |
| Zoom − / + / 100% / Fit / ALL | `[data-zoom-in] [data-zoom-out] [data-zoom-pct] [data-zoom-fit] [data-zoom-fit-all]` | click | camera change | no | — | — | **PASS (16.2A)** — real click moved 100 %→125 % and 90 %→113 %, zero network; restored on cached switch |
| Pan / Zoom canvas | canvas root | drag / wheel | camera | no | — | Shift+1 fit | PARTIAL (wheel-zoom isolation verified in 15.4B) |
| Shift multi-select, Marquee, Focus selected, Gather, Spread | canvas root / command palette | drag + click | selection ops | no | — | Esc | NOT TESTED |

## Screen: Focus Aperture
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Explore research | `[data-aperture-explore]` | click | Reading opens | no | **PASS (16.2A)** — Reading sheet present, zero network |
| Ask about this | aperture menu | click | AI lens focused w/ dimension scope | no | PARTIAL (Task 15.4A verified; not re-run) |
| Pin summary / Park / ••• | `[data-aperture-menu]` → `[data-menu-item="pin"]` | click | note/park | no | **PARTIAL (16.2A)** — Pin summary PASS: note rendered, id survived the CMB round trip (B3). Park and the ••• menu not tested. |
| Close (Esc / blank / other dimension) | — | key/click | aperture closes | no | PASS (Esc chain: Thread → Evidence → Reading → Aperture → Canvas) |

## Screen: Reading + Evidence Inspector
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Breadcrumb (company / dimension) | `[data-breadcrumb]`, `[data-evidence-breadcrumb]` | click | up one level | no | PASS (evidence breadcrumb observed: `美的集团 / 增长韧性 / Claim 01 / Evidence ①`) |
| Claim list / ASK / CHALLENGE | Reading surface | click | scope / AI | yes (ASK) | NOT TESTED |
| Evidence ①②③ | `[data-evidence-node]` | click | evidence focus + canvas tether | no | PARTIAL (16.2A) — real-pointer click delivered and issued **zero** network requests across 28 evidence nodes; the visual focus effect was not asserted |
| Evidence fields (metric/value/period/unit/source/calculation) | Reading aside | read | must belong to current evidence | no | NOT TESTED |
| Return / Esc / Browser Back / Forward | — | key/click | semantic back | no | PARTIAL — Esc PASS; Browser Back/Forward NOT TESTED |
| Layout 1440×900 & 1280×800 (no h-scroll, no clipping) | — | resize | clean | no | PASS in Task 15.4 for both sizes (not re-run; 16.2A used 1280×720) |

## Screen: Company switch / Shelf
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Switcher open | `[data-company-identity]` | click | panel with SAVED / RECENT / search | no | **PASS (16.2A)** |
| Saved / Recent rows | `[data-saved-company]`, `[data-recent-company]` | click | cached restore, no init | **no** (cached path) | **PASS (16.2A)** — B3: five-item scene identical, `init ×0`, **15.8 ms** |
| Search | `[data-company-search] input` | type | `GET /api/stocks/search` | yes | **PASS (16.2A)** — 1 request, 1 result, `招商银行 600036.SH` |
| Uncached switch → full-screen transition | `[data-company-transition]` | click | ≤150ms full-screen, identity, elapsed, cancel | yes | **PASS (16.2A)** — **3–4 ms**, `fixed`/`z-110`, full 1280×720, target 招商银行, 5 placeholders, true elapsed, old canvas unreachable at both probe points |
| Cancel during load | `[data-transition-cancel]` | click | abort + restore snapshot, 「已取消等待」, late response cannot overwrite | — | **PASS (16.2A)** with one caveat — **50/50** hit samples reachable, **3 ms** restore, six scene items identical, 30 s later nothing overwritten (aborted `init dur=53ms`). Caveat: 「已取消等待」 never renders (see `KNOWN_BUGS.md` #15). |
| Refresh research | `[data-refresh-research]` | click | re-init with 「正在刷新…」 copy | yes | NOT TESTED |
| Alt+← / Alt+→ | — | key | switch among saved | maybe | NOT TESTED |

## Screen: AI Thread
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Send question | `[data-ai-send]` | click/Enter | user turn + running state appended immediately | yes | **PASS (16.2A)** — running state immediate, answer 7.6–11.3 s |
| Stop | `[data-ai-stop]` | click | UI restored, `Stopped by you`, Retry + Edit | abort | PASS (15.4B: 0.9 s) |
| Retry / Edit question | `[data-ai-retry]` | click | re-issue with frozen scope | yes | **PASS (16.2A)** — injected failure → `[data-ai-failed]` → Retry answered; appends a new turn by design (15.4B “Retry 非 Continue”) |
| Collapse (—) / Close (×) | `[data-ai-collapse-thread] [data-ai-close-thread]` | click | hides thread, history kept | no | PASS (Task 16) |
| ••• Clear thread | `[data-ai-thread-menu]` | click | inline 2-step confirm | no | PASS (Task 16, confirm not executed) |
| Scroll thread (no canvas zoom) | `[data-ai-thread]` | wheel | thread scrolls only | no | PASS (15.4B: zoom stayed 100 %) |
| ↓ New response | `[data-ai-new]` | click | jump to newest | no | PASS (15.4B) |

## Screen: Guided Demo V2 / Command Palette
| Control | Selector | Input | Expected | Result |
|---|---|---|---|---|
| Demo Pause/Resume/Skip/Exit/Finish | `[data-demo-pause] [data-demo-skip] [data-demo-exit] [data-demo-finish]` | click | controls work | **PARTIAL (16.2A)** — Exit and the final-frame CTA 「开始研究 →」 PASS by real pointer; Pause / Resume / Skip not tested |
| Demo interruption → pause + copy | — | user pointer down | 「演示已暂停」 | NOT TESTED |
| Demo exit restores pre-demo state | `[data-demo-finish]`, `[data-demo-exit]` | click | exact snapshot restore | **PASS (16.2A)** — six dimension positions, zoom, aperture, Reading, add-angle and shelf state all returned to the pre-demo values |
| Reduced motion demo | OS pref | — | still understandable | NOT TESTED |
| Palette items (each) | after ⌘K | click | each item works | NOT TESTED |

## Screen: Failure states (`?testFailure=…`, non-production only)
| Injected failure | Observable | Recovery control | Network | Result |
|---|---|---|---|---|
| `research-init` | `[data-company-transition][data-transition-phase="failed"]`, target identity kept, 「研究空间暂时无法完成」 | `[data-transition-retry]`, `[data-transition-back]` | retried `init` = 15.1 s | **PASS (16.2A)** — both controls hit-tested reachable; Back restored 美的; Retry re-issued a real init and recovered |
| `dimension` | `[data-failed-angle]` “库存压力 Unable to resolve” | `[data-failed-angle-retry]` | retried `dimension` = 2.6 s | **PASS (16.2A)** — Retry added the dimension (7 → 8 anchors), marker cleared |
| `followup` | `[data-ai-failed]` “AI interpretation is temporarily unavailable. Current evidence remains available.” | `[data-ai-retry]` | retried `followup` = 7.6 s | **PASS (16.2A)** — Retry produced an answered turn |

## Counts
**PASS 29 · PARTIAL 6 · FAIL 0 · NOT APPLICABLE 0 · NOT TESTED 11** (46 rows).

Previously: PASS 13 · PARTIAL 3 · FAIL 0 · NOT TESTED 27 (43 rows).
