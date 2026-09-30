# INTERACTION MANIFEST — Task 16.2

**Result column convention (per §41):** `PASS` / `FAIL` / `NOT APPLICABLE` / `NOT TESTED`.
`NOT TESTED` is used where no browser run happened in this session — it is not a soft PASS, and it must not be read as one. §44 is respected: 385 unit tests passing is **not** evidence for any row here.

Session facts that apply to every `NOT TESTED` row: the in-app browser capture surface returned `screenshot surface preparation timed out` / `screenshot 超时` on most attempts, and scripted flows were blocked by a stale-Reading state that hid the header chrome. Fixes exist (see `KNOWN_BUGS.md` #1) but were not re-audited.

## Screen: Company Canvas
| Control | Selector (as implemented today) | Input | Expected | Network | Endpoint | Return path | Result |
|---|---|---|---|---|---|---|---|
| Company Identity (open switcher) | `[data-company-identity]` | click | shelf panel | no | — | toggle same control | NOT TESTED |
| Save to shelf ☆/★ | `[data-save-company]` | click | toggle saved, persist localStorage | no | — | — | PASS (observed in Task 16: `★ 已保存` + localStorage) |
| 更换公司 → | `[data-change-company]` | click | shelf panel | no | — | toggle | NOT TESTED |
| ▶ 60s 演示 | `[data-demo-start]` | click | start Guided Demo V2 | no | — | Exit | NOT TESTED (V2 never run) |
| Dimension hover | `[data-anchor-id]` | hover | summary hint | no | — | — | PASS (Task 16.1: 35ms, net:no) |
| Dimension click → Aperture | `[data-anchor-id]` | click | Focus Aperture | no | — | Esc / blank click | PASS (35ms, net:no; aperture opens with collision metrics) |
| Dimension drag | `[data-anchor-id]` + pointer arbitration | drag | manual position | no | — | — | NOT TESTED |
| Suggested research | `[data-suggestion-trigger]`, `[data-suggestion]` | click / drag | add angle | yes on submit | `/api/research/dimension` | — | NOT TESTED |
| Add research angle | command palette → Add research angle | click + type | provisional anchor | yes | `/api/research/dimension` | Retry / stays | PARTIAL (implemented; failure path retains anchor — not re-run) |
| AI Research Lens | `[data-ai-lens] textarea` | focus/type | open thread | no | — | Esc | PASS (11ms, net:no) |
| ⌘K Command Palette | ⌘K | key | palette opens | no | — | Esc | NOT TESTED (driver could not emit Ctrl+K reliably) |
| Zoom − / + / 100% / Fit / ALL | `[data-zoom-in] [data-zoom-out] [data-zoom-pct] [data-zoom-fit] [data-zoom-fit-all]` | click | camera change | no | — | — | NOT TESTED |
| Pan / Zoom canvas | canvas root | drag / wheel | camera | no | — | Shift+1 fit | PARTIAL (wheel-zoom isolation verified in 15.4B) |
| Shift multi-select, Marquee, Focus selected, Gather, Spread | canvas root / command palette | drag + click | selection ops | no | — | Esc | NOT TESTED |

## Screen: Focus Aperture
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Explore research | aperture button | click | Reading opens | no | PASS (74ms, net:no) |
| Ask about this | aperture menu | click | AI lens focused w/ dimension scope | no | PARTIAL (Task 15.4A verified; not re-run) |
| Pin summary / Park / ••• | aperture menu | click | note/park | no | NOT TESTED |
| Close (Esc / blank / other dimension) | — | key/click | aperture closes | no | PASS (Esc chain: Thread → Evidence → Reading → Aperture → Canvas) |

## Screen: Reading + Evidence Inspector
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Breadcrumb (company / dimension) | `[data-breadcrumb]`, `[data-evidence-breadcrumb]` | click | up one level | no | PASS (evidence breadcrumb observed: `美的集团 / 增长韧性 / Claim 01 / Evidence ①`) |
| Claim list / ASK / CHALLENGE | Reading surface | click | scope / AI | yes (ASK) | NOT TESTED |
| Evidence ①②③ | Reading anchors | click | evidence focus + canvas tether | no | NOT TESTED |
| Evidence fields (metric/value/period/unit/source/calculation) | Reading aside | read | must belong to current evidence | no | NOT TESTED |
| Return / Esc / Browser Back / Forward | — | key/click | semantic back | no | PASS for Esc; Browser Back semantics NOT TESTED |
| Layout 1440×900 & 1280×800 (no h-scroll, no clipping) | — | resize | clean | no | PASS in Task 15.4 for both sizes (not re-run) |

## Screen: Company switch / Shelf
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Switcher open | `[data-company-identity]` | click | panel with SAVED / RECENT / search | no | PASS (52ms, net:no) |
| Saved / Recent rows | `[data-saved-company]`, `[data-recent-company]` | click | cached restore, no init | **no** (cached path) | NOT TESTED (measurement aborted) |
| Search | `[data-company-search] input` | type | `GET /api/stocks/search` | yes | PASS (observed: 招商银行 600036.SH) |
| Uncached switch → full-screen transition | `[data-company-transition]` | click | ≤150ms full-screen, identity, elapsed, cancel | yes | NOT TESTED (§31 evidence missing) |
| Cancel during load | `[data-transition-cancel]` | click | abort + restore snapshot, 「已取消等待」, late response cannot overwrite | — | NOT TESTED |
| Refresh research | `[data-refresh-research]` | click | re-init with 「正在刷新…」 copy | yes | NOT TESTED |
| Alt+← / Alt+→ | — | key | switch among saved | maybe | NOT TESTED |

## Screen: AI Thread
| Control | Selector | Input | Expected | Network | Result |
|---|---|---|---|---|---|
| Send question | `[data-ai-send]` | click/Enter | user turn + running state appended immediately | yes | PASS for the immediate state (Task 15.4B); Enter-to-send verified |
| Stop | `[data-ai-stop]` | click | UI restored, `Stopped by you`, Retry + Edit | abort | PASS (Task 15.4B: 0.9s) |
| Retry / Edit question | `[data-ai-retry]` | click | re-issue with frozen scope | yes | PASS (15.4B) |
| Collapse (—) / Close (×) | `[data-ai-collapse-thread] [data-ai-close-thread]` | click | hides thread, history kept | no | PASS (Task 16) |
| ••• Clear thread | `[data-ai-thread-menu]` | click | inline 2-step confirm | no | PASS (Task 16, confirm not executed) |
| Scroll thread (no canvas zoom) | `[data-ai-thread]` | wheel | thread scrolls only | no | PASS (Task 15.4B: zoom stayed 100%) |
| ↓ New response | `[data-ai-new]` | click | jump to newest | no | PASS (15.4B) |

## Screen: Guided Demo V2 / Command Palette
| Control | Selector | Input | Expected | Result |
|---|---|---|---|---|
| Demo Pause/Resume/Skip/Exit/Finish | `[data-demo-pause] [data-demo-skip] [data-demo-exit] [data-demo-finish]` | click | controls work; Space/←/→/Esc | NOT TESTED (V2 never run in browser) |
| Demo interruption → pause + copy | — | user pointer down | 「演示已暂停」 | NOT TESTED |
| Demo exit restores pre-demo state | — | click | exact snapshot restore | NOT TESTED (V1 restore was PASS in Task 16: aperture + 7 dims + 18 turns restored) |
| Reduced motion demo | OS pref | — | still understandable | NOT TESTED |
| Palette items (each) | after ⌘K | click | each item works | NOT TESTED |

## Counts
PASS 13 · PARTIAL 3 · FAIL 0 · NOT APPLICABLE 0 · **NOT TESTED 27**.
