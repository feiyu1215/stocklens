# LOADER_REFERENCE_AUDIT

Task 16.1 — full-screen "research space is being built" transition for StockLens company-research init.
Audited 2026-09-30. Every claim below comes from a live fetch of the listed source that day; nothing is written from memory.

Why the wait is real: uncached company research init is a genuine 15–30s operation — median ≈16.8s for 000333.SZ（美的, n=4）and ≈15.6s for 600036.SH（招行, n=4）, 94–97% of it inside two LLM calls (framer ≈3.8s + composer ≈7.0s medians). Evidence: `docs/design-audit/task16-1/PERFORMANCE_RESULTS.md` (lines 14, 22–23). Every reference is judged against that fact.

## Inspection method (honesty log)

- Sources were opened via WebFetch on the GitHub repo pages, the docs sites, and specific component/directory pages; component source where needed via `raw.githubusercontent.com` and Aceternity's official registry endpoint `ui.aceternity.com/registry/multi-step-loader.json` (its docs "Code" tab is client-rendered and was not visible to fetch; the registry JSON contains the real file).
- `reactbits.dev` and `ui.aceternity.com` doc pages render client-side (fetch returns only the title/preview shell), so react-bits was inspected through its GitHub README + directory listings + raw files, and Aceternity through its registry JSON + docs props table.
- A few raw fetches returned ECONNRESET/404 on wrong path guesses and succeeded on retry. All five references were reached — none is `NOT INSPECTED (fetch failed)`.

## 1. motion-primitives — https://github.com/ibelick/motion-primitives

- Component/pattern inspected: docs sidebar (motion-primitives.com/docs) + Transition Panel doc page. Real names seen: **Transition Panel**, Animated Group, Morphing Dialog, Morphing Popover, Text Effect / Text Shimmer / Text Roll / Text Scramble, Animated Number, In View. Built on `motion` + Tailwind; MIT; repo README says "This project is in beta." The library has **no loader primitive**.
- WILL reuse: Transition Panel's contract — externally supplied `activeIndex` plus `variants {enter/center/exit}` and `transition` — i.e. visibility driven by real state, never by an internal timer; this is exactly how our stage display must be wired. Also the one-line-at-a-time reveal pacing from the Text Effects group.
- Will NOT reuse: panel-carousel semantics (it animates between *chosen* children; our wait is one continuous task, not a sequence). No full-screen overlay ownership to copy (Dialog is not the own-the-screen pattern). Beta status → no code vendoring.

## 2. magicui — https://github.com/magicuidesign/magicui

- Component/pattern inspected: docs component index + Animated Circular Progress Bar page. Real names seen: **Animated List**, **Blur Fade**, Text Animate, Typing Animation, Word Rotate, **Number Ticker**, Animated Circular Progress Bar, Animated Shiny Text. README: "Animated components and effects you can copy and paste into your apps"; Framer Motion; MIT.
- WILL reuse: Animated List / Blur Fade staggered reveal pacing — the 60–100ms stagger for the completion morph into real dimensions; Number Ticker as the markup pattern for a **real elapsed-seconds** counter.
- Will NOT reuse: **Animated Circular Progress Bar** — it is determinate (`value`/`min`/`max` gauge) and its own demo fakes it (value +10 every 2s). We have no real completion fraction, so a percentage gauge would be fabricated precision. Typing Animation — reads as "text is being generated for you right now", which would claim pipeline activity that may not exist.

## 3. react-bits — https://github.com/DavidHDev/react-bits

- Component/pattern inspected: README + directory listings (`src/content/{Animations,Components,Micro}`) + **LatticeLoader** (`LatticeLoader.jsx`, `LatticeLoader.css`). README: "200+ components", categories Text Animations / Animations / Components / Micro / Backgrounds; installed via shadcn and jsrepo CLIs or manual copy-paste; "4 variants per component"; license "MIT + Commons Clause". No component literally named "loader" in Animations/Components; **LatticeLoader** (Micro) is its loader: a 3×3/4×4 CSS-grid cell loader with named indeterminate patterns (arrow, dots, ripple, spiral, orbit, snake, sweep, spin, rain, pulse), terminal done/error cell marks (`MARKS`), and CSS-var knobs (`--ll-cycle: 864ms`, `--ll-cell: 6px`, `--ll-idle`, `--ll-peak`).
- WILL reuse: LatticeLoader's honest, indeterminate "work is happening, duration unknown" visual language and its grid/pattern motion as the seed of our one dominant resolving visual; `FadeContent`-style fade-in reveal for post-completion content.
- Will NOT reuse: the component as-is / its code (compact inline scale — we need full-screen ownership; variant matrix JS-CSS/JS-TW/TS-CSS/TS-TW is more surface than we want; Commons Clause adds distribution constraints — pattern inspiration only, no vendoring).

## 4. ivandotv/nextjs-page-transitions — https://github.com/ivandotv/nextjs-page-transitions

- Component/pattern inspected: README, `components/` listing and sources — **`AnimSwitcher.tsx`** and **`lib/animations.ts`** (real variant names: "Slide Up", "Slide Right", "Fade Back", "Rotate Y/X/Z"). It is a **demo app**, not a library: "Demo of full page transitions with Next.js and Framer Motion library"; README is a dev.to article link + Netlify demo + GIFs. `AnimSwitcher` is a `<select>` plus an "Overlap page transitions" checkbox toggling `exitBeforeEnter`. No license observed on the fetched pages; maintenance unverified (54 commits, 8 open PRs).
- WILL reuse: the **exit-before-enter ("overlap") concept** — old layer animating out as the new one comes in — and the uniform variant template (one `initial`/`animate`/`exit` triple with a single `transition.duration`). Its `slideUp` moves `top: 100vh → 0` with `scale: 0.4 → 1`, which is the closest analog to our "overlay settles into real content" exit.
- Will NOT reuse: the code itself (demo repo, no license observed — do not copy from an unlicensed demo), route-change coupling (our transition is data-driven, not navigation-driven), and the 0.7s durations (our budget is ≤100ms open, ≤700ms total morph).

## 5. Aceternity UI Multi Step Loader — https://ui.aceternity.com/components/multi-step-loader

Inspected from the official registry source (`registry/multi-step-loader.json` → `components/ui/multi-step-loader.tsx`, deps `@tabler/icons-react`, `motion`). Real props: `loadingStates: {text}[]`, `loading?: boolean`, `duration = 2000`, `loop = true` (`LoaderCore` also takes `value = 0`).
Real behavior: a `useEffect` + `setTimeout(duration)` advances `currentState`; with the default `loop = true` it wraps to 0 after the last state. **No real signal goes in, and no completion signal goes out** — the display is a pure timer. Structure: `AnimatePresence` fade around a container `fixed inset-0 z-[100] w-full h-full flex items-center justify-center backdrop-blur-2xl`; the step list dims neighbors (`opacity = max(1 − distance*0.2, 0)`), drifts `y = −(value*40)` per step over 0.5s, and highlights the active row. No percentage, no progress bar — and **no dismiss/close control in the component**.

WILL borrow (four things, and nothing else):
- **Full-screen ownership** — `fixed inset-0`, `z-[100]`, backdrop blur, mounted/unmounted from outside by a boolean tied to the real request, faded via `AnimatePresence`. Ours: fixed layer ≥ z-index 100, opacity-only open ≤100ms.
- **Loading-state composition** — one focused status area with dimmed neighbors, not a checklist of N stages. We keep the focus-and-dim composition; we drop the "completed list" semantics.
- **Motion pacing** — the per-row 0.5s reveal and 40px-per-step drift as *feel*, retimed to our budget (open ≤100ms; completion stagger 60–100ms; total morph ≤700ms).
- **Dismiss/close affordance** — the reference keeps the overlay parent-controlled and exit-animated but ships **no in-component close control**; we borrow the parent-controlled exit contract and ADD a real cancel control (≥40px hit area) that aborts the actual request. This is an addition, not a copy.

FORBIDDEN to borrow, and why:
- **Timer-driven fake business steps** (`setTimeout(duration)` advancing `currentState` regardless of backend state; `loop` re-wrapping to zero while the request may still be running) — FORBIDDEN. Our init is real and slow (medians 16.8s / 15.6s, dominated by two LLM calls): step N at wall-clock T would carry no information about the actual pipeline.
- **Fake progress percentage** — FORBIDDEN. LLM call durations are open-ended; we cannot compute a real completion fraction, so any % or bar is fabricated precision (this is the same reason MagicUI's determinate gauge is rejected above).
- **Fake financial pipeline stages** (decorative captions like "抓取财报 → 估值建模 → 归因" advanced on a timer) — FORBIDDEN, and worse here: in a financial research product it would imply data operations that may not be happening at that instant. Truthfulness rule: every pixel shown during the wait must correspond to real work, or be honestly indeterminate.

## What this means for our implementation

1. Full-screen fixed layer, `inset: 0`, z-index ≥ 100, backdrop blur; owned by the research-space route and mounted off a **real request-start timestamp**.
2. Open ≤100ms from pointerdown, opacity-only; never wait for a fetch response to start showing it.
3. Big target identity: stock code + name (e.g. 000333.SZ 美的集团) as the dominant element — the user must never doubt which research space is being built.
4. One dominant resolving visual (indeterminate, seeded by LatticeLoader-family grid motion), plus at most one honest status line; no stage list.
5. Real elapsed time only: a seconds counter derived from the request timestamp (monotonic), Number-Ticker-style digits.
6. No fake percentage, no predicted remaining time, no looping step list; status text may describe the space being built, never claim pipeline events.
7. Cancel affordance visible from the first frame, hit area ≥40px, wired to a real abort; exit is parent-controlled (fade, AnimatePresence-style) — the reference ships none, so this is ours.
8. On real completion, morph the layer into the real reading layout: 60–100ms stagger per region, ≤700ms total, then hand focus to the reading view.

Fetched 2026-09-30: github.com/ibelick/motion-primitives · motion-primitives.com/docs · motion-primitives.com/docs/transition-panel · github.com/magicuidesign/magicui · magicui.design/docs/components · magicui.design/docs/components/animated-circular-progress-bar · github.com/DavidHDev/react-bits (+ `src/content/{Animations,Components,Micro}`, `Micro/LatticeLoader/{LatticeLoader.jsx,LatticeLoader.css}` raw) · github.com/ivandotv/nextjs-page-transitions (+ `components/`, `components/AnimSwitcher.tsx`, `lib/animations.ts` raw) · ui.aceternity.com/components/multi-step-loader · ui.aceternity.com/registry/multi-step-loader.json
