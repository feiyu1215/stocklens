# INTERACTION MANIFEST — Task 16.2

**Result column convention (per §41):** `PASS` / `FAIL` / `NOT APPLICABLE`.

`NOT APPLICABLE` is used only with an explicit reason. §44 is respected: 385 unit tests passing is **not** evidence for any row here.

**Round 16.2B closed every remaining row.** The 11 rows that were `NOT TESTED` and the 6 sub-items that were `PARTIAL` after 16.2A were all exercised with trusted pointer / real keyboard input against build `db618d4`. Four defects were found by that sweep and fixed (see `KNOWN_BUGS.md` #19–#22); every row below is post-fix evidence.

**Counts:** PASS 47 · FAIL 0 · NOT APPLICABLE 1 · **NOT TESTED 0 · PARTIAL 0**.

## Screen: Company Canvas
| Control | Selector (as implemented today) | Input | Expected | Network | Endpoint | Return path | Result |
|---|---|---|---|---|---|---|---|
| Company Identity (open switcher) | `[data-company-identity]` | click | shelf panel | no | — | toggle same control | **PASS (16.2A/16.2B)** — opener for every switch run |
| Save to shelf ☆/★ | `[data-save-company]` | click | toggle saved, persist localStorage | no | — | — | **PASS (16.2B)** — `★ 已保存` + `stocklens.shelf.saved` |
| 更换公司 → | `[data-change-company]` | click | shelf panel | no | — | toggle | **PASS (16.2B)** — opens the shelf, SAVED/RECENT rendered, closes by clicking either opener again (the documented return path; Esc is deliberately not bound to the switcher) |
| ▶ 演示 | `[data-demo-prompt-start]`, `[data-demo-start]` | click | start Guided Demo V2 | no | — | Exit / CTA / Esc | **PASS (16.2A/16.2B)** — both entry points reachable |
| Dimension hover | `[data-anchor-id]` | hover | summary hint | no | — | — | PASS (16.1: 35ms, net:no) |
| Dimension click → Aperture | `[data-anchor-id]` | click | Focus Aperture | no | — | Esc / blank click | **PASS (16.2A/16.2B)** — aperture opened in every round on demand |
| Dimension drag | `[data-anchor-id]` + pointer arbitration | drag | manual position | no | — | — | **PASS (16.2A)** — real drag moved `01_增长韧性` from `761.694px/223.92px` to `873.694px/456.4px`; the exact value came back on cached restore |
| Suggested research | `[data-suggestion-trigger]`, `[data-suggest-pop]`, `[data-suggest-add]` | click / drag | add angle | yes on submit | `/api/research/dimension` | pop toggles | **PASS (16.2B, after 3 fixes)** — click → rationale pop → `Add to research` = 1 dimension request; drag → drop in the canvas = 1 dimension request. Verified at 1440×900, 1280×800 and 1280×720: trigger, popover and Add button all fully inside the viewport and hit-testing themselves. |
| Add research angle | `[data-command-hint]` → `[data-lens-item="Add research angle"]` → `[data-add-angle]` → `[data-add-submit]` | click + type | provisional anchor; failure keeps the anchor + Retry | yes | `/api/research/dimension` | `[data-failed-angle-retry]` | **PASS (16.2A/16.2B)** — happy path 6→7 anchors; injected failure showed “库存压力 Unable to resolve / Retry” and Retry recovered |
| AI Research Lens | `[data-ai-lens] textarea` | focus/type | open thread | no | — | Esc | **PASS (16.2A/16.2B)** — focus/type/send, zero network until send |
| ⌘K Command Palette | `Control+K` / `Meta+K` | key | palette opens | no | — | Esc | **PASS (16.2B)** — trusted `Control`+`k` keydown pair; palette opens; Esc closes |
| Zoom − / + / 100% / Fit / ALL | `[data-zoom-in] [data-zoom-out] [data-zoom-pct] [data-zoom-fit] [data-zoom-fit-all]` | click | camera change | no | — | — | **PASS (16.2A)** — 100 %→125 % and 90 %→113 %, zero network; restored on cached switch |
| Pan / Zoom canvas | canvas root | drag / wheel | camera | no | — | Shift+1 fit | **PASS (16.2B)** — wheel over the canvas moved the camera 100 %→145 %, zero network |
| Shift multi-select, Marquee | canvas root + `Shift` drag | drag | selection ops | no | — | Esc / Clear selection | **PASS (16.2B)** — a Shift marquee produced `Focus selected (4)`; the two unselected dimensions stayed untouched |
| Focus selected / Gather / Spread / Clear selection | Command Palette items | click | positions converge / separate / clear | no | — | — | **PASS (16.2B)** — Focus selected dimmed the unselected to `0.1`; Gather converged the selected into a tight two-column cluster while the unselected stayed on their slots; Spread returned them to their default slots with **0 overlapping dimension pairs**; Clear selection restored every opacity to `0.92` and reverted the palette to its neutral branch. Zero business requests for all four. |
| Park / Restore | aperture `•••` → `[data-menu-item="park"]`, `[data-parked]` chip | click | leaves / returns to the layout | no | — | restore chip, `Restore all parked (N)` | **PASS (16.2B)** — Park removed the dimension (6→5 anchors) and produced the `增长韧性 · parked` chip; clicking the chip restored it (5→6) with `data-reveal="in"`. Zero business requests; nothing else was deleted. |

## Screen: Focus Aperture
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Explore research | `[data-aperture-explore]` | click | Reading opens | no | **PASS (16.2A/16.2B)** — Reading sheet + claims, zero network |
| Ask about this | `[data-aperture-menu]` → `[data-menu-item="ask"]` | click | AI lens focused w/ dimension scope | no | **PASS (16.2B)** — lens focused, scope reads `美的集团 / 增长韧性`, placeholder `追问「增长韧性」…`, exactly one composer in the document, zero network |
| Pin summary / Park / ••• | `[data-aperture-menu]` → `[data-menu-item]` | click | note/park | no | **PASS** — Pin summary: note rendered, id survived the CMB round trip (B3). Park: verified above. The `•••` menu lists exactly Pin summary / Ask about this / Park, all reachable. |
| Close (Esc / blank / other dimension) | — | key/click | aperture closes | no | **PASS** — Esc chain reaches Canvas (Demo → Palette → Thread → Evidence → Reading → Aperture) |

## Screen: Reading + Evidence Inspector
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Breadcrumb (company / dimension) | `[data-breadcrumb]`, `[data-evidence-breadcrumb]` | click | up one level | no | PASS (evidence breadcrumb observed: `美的集团 / 增长韧性 / Claim 01 / Evidence ①`) |
| Claim list | `[data-claim-id]` | read/click | claims that belong to the open dimension | no | **PASS (16.2B)** — 3–5 claims rendered per dimension, click sets the active claim |
| Claim ASK | claim row → `ASK` | click | one global AI Lens with claim scope; no second composer | no | **PASS (16.2B)** — lens focused, scope `增长韧性 / Claim`, placeholder switches, **exactly one `<textarea>` in the whole document**, no inline thread input, zero request from ASK itself |
| Claim CHALLENGE | claim row → `CHALLENGE` | click | three-layer challenge panel | no | **PASS (16.2B)** — toggles a real panel with `SUPPORT` (the claim's evidence statements), `COUNTER-SIGNALS` (“当前维度内未见方向相反的已验证证据。”) and `UNKNOWN` (“该维度暂无标注为未知的结论。”); second click collapses it. Not a dead affordance. |
| Evidence ①②③ | claim row → `button[aria-label="证据 N"]` | click | evidence focus + canvas tether | no | **PASS (16.2B)** — ① pinned `EV_FACT_FIN_OCF_YOY_YTD` and ② pinned `EV_FACT_FIN_OCF_YOY_QUARTER`; each click moved the rail to `PINNED / UNPIN` with that evidence's own title, and the matching `[data-evidence-node]` circle went hot (`r=5.5`, `fill=#2F66FF`). Zero network. |
| Evidence fields (metric/value/period/unit/source/calculation) | Reading aside | read | must belong to current evidence | no | **PASS (16.2B)** — the rail showed the current evidence's name/value/period (`经营现金流净额 / 归母净利润（累计）1.42x 2026-Q2`), the source line `FUYAO · act_cash_flow_net 2026-Q2 VERIFIED`, and `CALCULATION` revealed the actual formula `(2026-Q2 cumulative operating_income / 2025-Q2 cumulative operating_income - 1) × 100`. Fields changed with the pinned evidence. |
| Return / Esc / Browser Back / Forward | — | key/click | semantic back | no | **PASS (16.2B)** — `Tab.back()` closed Reading (→ aperture), `Tab.forward()` restored it; the Esc chain was verified step by step after fix #22 |
| Layout 1440×900 & 1280×800 (no h-scroll, no clipping) | — | resize | clean | no | **PASS (16.2B)** — measured at both sizes: `scrollWidth === clientWidth`, identity / AI Lens / anchors / aperture Explore / Reading sheet / 316 px evidence rail / switcher input all inside the viewport and hit-testing themselves, in both Canvas and Reading |
| Layout 390×844 (phone width) | — | resize | reduced mobile bar | no | **NOT APPLICABLE — out of supported scope, measured.** The product is a 1440×900 desktop research canvas. At 390×844 the required non-spatial bar holds: no blank screen (463 chars of visible content), no horizontal overflow, AI Lens present and reachable. The *spatial* interactions do not: the camera floor `MIN_SCALE 0.65` cannot fit the 1440-wide world into 390, so all 6 dimensions render off-screen (screen x 420–1001, y 571–932), and the first-use hint card overlaps the Company Identity button (prompt x 58–358 / y 80–210 vs identity y 51–123). No mobile-specific layout exists in v5; this is a known scope boundary, not an intentional mobile simplification. |

## Screen: Company switch / Shelf
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Switcher open | `[data-company-identity]`, `[data-change-company]` | click | panel with SAVED / RECENT / search | no | **PASS (16.2A/16.2B)** |
| Saved / Recent rows | `[data-saved-company]`, `[data-recent-company]` | click | cached restore, no init | **no** (cached path) | **PASS (16.2B)** — B3: five-item scene identical, `init ×0`, **15.8 ms**. SAVED row returned from CMB with `init ×2 → ×2` (zero new) and no transition. |
| Search | `[data-company-search] input` | type | `GET /api/stocks/search` | yes | **PASS (16.2A/16.2B)** — 1 request, `招商银行 600036.SH` |
| Uncached switch → full-screen transition | `[data-company-transition]` | click | ≤150ms full-screen, identity, elapsed, cancel | yes | **PASS (16.2A)** — **3–4 ms**, `fixed`/`z-110`, full 1280×720, target 招商银行, 5 placeholders, old canvas unreachable |
| Cancel during load | `[data-transition-cancel]` | click | abort + restore snapshot, late response cannot overwrite | — | **PASS (16.2A)** — 50/50 hit samples reachable, **3 ms** restore, six scene items identical, 30 s later nothing overwritten (aborted `init dur=53ms`) |
| Refresh research | `[data-refresh-research]` | click | re-init with 「正在刷新…」 copy | yes (×1) | **PASS (16.2B)** — full-screen transition reads `正在刷新美的集团的研究空间` + `REFRESHING RESEARCH SPACE` (distinct from the BUILDING copy); cancel restored the scene bit-identically with the request aborted at 53 ms; a completed refresh replaced the payload with a fresh dimension set; **exactly one `init` per refresh, never duplicated** |
| Alt+← / Alt+→ | — | key | switch among saved | maybe | **PASS (16.2B)** — with two saved companies, `Alt+ArrowLeft` and `Alt+ArrowRight` stepped between them; both took the **cached** path (no transition, `init` count unchanged at 2) |

## Screen: AI Thread
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Send question | `[data-ai-send]` | click/Enter | user turn + running state appended immediately | yes | **PASS (16.2A/16.2B)** — running state immediate, answer 7.6–11.3 s, grounded and explicitly bounded |
| Stop | `[data-ai-stop]` | click | UI restored, `Stopped by you`, Retry + Edit | abort | PASS (15.4B: 0.9 s) |
| Retry / Edit question | `[data-ai-retry]` | click | re-issue with frozen scope | yes | **PASS (16.2A)** — injected failure → `[data-ai-failed]` → Retry answered; appends a new turn by design (15.4B “Retry 非 Continue”) |
| Collapse (—) / Close (×) | `[data-ai-collapse-thread] [data-ai-close-thread]` | click | hides thread, history kept | no | PASS (Task 16) |
| ••• Clear thread | `[data-ai-thread-menu]` | click | inline 2-step confirm | no | PASS (Task 16, confirm not executed) |
| Scroll thread (no canvas zoom) | `[data-ai-thread]` | wheel | thread scrolls only | no | PASS (15.4B: zoom stayed 100 %) |
| ↓ New response | `[data-ai-new]` | click | jump to newest | no | PASS (15.4B) |

## Screen: Guided Demo V2 / Command Palette
| Control | Selector | Input | Expected | Result |
|---|---|---|---|---|
| Demo Pause / Resume | `[data-demo-pause]` | click | pauses / resumes; label flips | **PASS (16.2B)** — label `Resume` ⇄ `Pause`; after resume the scene advanced 1/6 → 2/6 |
| Demo Skip | `[data-demo-skip]` | click | advances one scene | **PASS (16.2B)** — 2/6 → 3/6 immediately |
| Demo Exit / Finish | `[data-demo-exit]`, `[data-demo-finish]` | click | leaves the demo, restores the snapshot | **PASS (16.2A/16.2B)** — Exit and the closing CTA both work; six dimension positions, zoom, aperture, Reading, add-angle and shelf state all returned to the pre-demo values |
| Demo interruption → pause + copy | — | user pointer down | 「演示已暂停」 | **PASS (16.2B)** — a real pointerdown on the empty canvas paused the demo, showed `演示已暂停 · 继续演示 / 退出并自行探索`, kept the overlay, and froze the progress until resumed |
| Demo keyboard | `Space` / `←` / `→` / `Esc` | key | pause / step / exit | **PASS (16.2B)** — Space toggled pause and resume, `ArrowRight` advanced 1/6 → 2/6, Escape exited the demo |
| Demo exit restores pre-demo state | `[data-demo-finish]`, `[data-demo-exit]` | click | exact snapshot restore | **PASS (16.2A/16.2B)** |
| Reduced motion demo | `prefers-reduced-motion: reduce` | media | still understandable | **PASS (16.2B)** — emulated through the app's own `MediaQueryList` (query intercepted before hydration): the demo pointer transition went `0.9s → 0s`, the transition layer's `backdrop-filter` went `blur(3px) → none`, and nothing depended on animation — the demo still advanced 1/6 → 2/6 with readable captions, the company switch still completed, the aperture and Reading still opened. |
| Palette items (each) | after Ctrl+K | click | each item works | **PASS (16.2B)** — neutral branch `Ask company / Fit view / Add research angle / Change company`; `Fit view` ran the real camera fit (100 %→67 %, zero network); `Add research angle` opened the real composer; with a selection the branch becomes `Focus selected (N) / Gather / Spread / Clear selection` and all four were exercised; with parked dimensions `Restore all parked (N)` appears |

## Screen: Failure states (`?testFailure=…`, non-production only)
| Injected failure | Observable | Recovery control | Network | Result |
|---|---|---|---|---|
| `research-init` | `[data-company-transition][data-transition-phase="failed"]`, target identity kept, 「研究空间暂时无法完成」 | `[data-transition-retry]`, `[data-transition-back]` | retried `init` = 15.1 s | **PASS (16.2A)** — both controls reachable; Back restored 美的; Retry re-issued a real init and recovered |
| `dimension` | `[data-failed-angle]` “库存压力 Unable to resolve” | `[data-failed-angle-retry]` | retried `dimension` = 2.6 s | **PASS (16.2A)** — Retry added the dimension (7 → 8 anchors), marker cleared |
| `followup` | `[data-ai-failed]` “AI interpretation is temporarily unavailable. Current evidence remains available.” | `[data-ai-retry]` | retried `followup` = 7.6 s | **PASS (16.2A)** — Retry produced an answered turn |

## Counts
**PASS 47 · FAIL 0 · NOT APPLICABLE 1 · NOT TESTED 0 · PARTIAL 0** (48 rows).

History: 16.2 → PASS 13 · PARTIAL 3 · NOT TESTED 27 (43 rows). 16.2A → PASS 29 · PARTIAL 6 · NOT TESTED 11 (46 rows).
