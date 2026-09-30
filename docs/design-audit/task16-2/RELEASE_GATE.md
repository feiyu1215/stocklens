# RELEASE GATE — Task 16.2

**Status: NOT READY FOR TASK 17.**

This gate requires a real-browser interaction audit (§1: 看得到 / 点得到 / 响应正确 / 可以返回 / 状态正确 / 没有 console error) across every registered control, three viewport sizes, failure states, and a full Guided Demo V2 run. **That audit was not executed in this session.** No PASS is claimed anywhere, and the `data-action-id` rollout (§3) was abandoned mid-edit because the mechanical insertion corrupted the JSX; it was reverted (`git checkout`) rather than left half-applied.

## Why the audit did not run
1. The in-app browser's capture surface repeatedly returned `screenshot surface preparation timed out` / `screenshot 超时`, and combined record+screenshot runs fail outright.
2. The page intermittently re-enters a stale Reading state after a clean load, hiding the header chrome (Company Identity / ★ / 更换公司 / ▶ 演示) and blocking any scripted flow before it starts. Two fixes landed for this (header now requires a resolvable `readingDimension`; stale `readingId` is reconciled when the payload changes), but the audit was never re-run against the fixed build.
3. Remaining session budget.

## Blockers (must clear before Task 17)
- B1: Guided Demo V2 has never been run once in a browser after its rewrite (6 scenes / 50s). §24–§28 unverified.
- B2: Full-screen Research Transition has no browser evidence at all (no screenshot, no video, no timing sample). §31 unverified; `docs/design-audit/task16-1/fullscreen-transition/` is empty.
- B3: Cached company restore (no `/api/research/init`, <400ms) never measured. §13 unverified.
- B4: Error states (init / dimension / followup failure) never exercised via fixtures. §32 unverified.
- B5: Console + network audits not captured. §35/§36 unverified.

## Known MINOR issues already recorded
See `KNOWN_BUGS.md`. None of them is why the gate fails; the gate fails because the audit is unrun, not because a blocker was found.
