# 003 — Respect `prefers-reduced-motion` in the score overlay

- **Status**: DONE (executed 2026-09-12; `pnpm typecheck` + full `pnpm build` green)
- **Commit**: 7854ed0
- **Severity**: LOW-MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (`public/overlay/index.html`), ~50 lines added

## Problem

The GUI app honors reduced motion (`src/renderer/src/assets/main.css:391-400`), but the
broadcast overlay page — `public/overlay/index.html`, a standalone page also openable in a
normal browser — has **no** `prefers-reduced-motion` handling. OBS browser sources inherit the
OS setting, so a motion-sensitive streamer previewing their overlay gets every slide, spin and
scale at full strength.

Movement-bearing animations in this file:

| Location | Animation | Movement content |
| --- | --- | --- |
| `:104-140` | `dynamicAddedScoreFloat` (`.added-score-float`) | translateY + scale + rotateZ on the "+N" float |
| `:373-392` | `dynamicSlideInFromRight` (`.slide-in-initial`) | translateX + scale + rotateY entrance, staggered per row |
| `:395-441` | `dynamicFadeInOverlay` / `dynamicFadeOutOverlay` (`.overlay-fade-in/out`) | scale + rotateX on the whole board |
| `:444-457` | `smoothSlideToPosition` (`.position-slide`) | translateY rank movement (JS-driven) |
| `:93-101`, `:230-302` | `flowGradient` (rainbow/gradient own-team borders) | continuous background-position flow |

Feedback that is **not** large motion and must be kept: score flash brightness pulse
(`enhancedGreenFlash`, `mkw-score-flash`), count-up glow (`countUpPulse`), current-player glow
pulses.

## Target

Reduced motion = fewer/gentler animations, **not zero** (per audit rule): keep opacity
feedback, drop position changes; freeze purely decorative constant motion.

**1. CSS** — append inside the existing `<style>` block, after the `:root { --anim-factor: 1; }`
rule (`public/overlay/index.html:493-495`):

```css
        /* OSのモーション低減設定に応答。移動系は不透明度のみへ減衰し、
           恒常的な装飾モーションは停止する（フィードバック系の発光は残す） */
        @media (prefers-reduced-motion: reduce) {
            .slide-in-initial {
                animation: reducedFadeIn calc(0.6s * var(--anim-factor)) ease-out forwards;
            }

            .position-slide {
                animation: none;
            }

            .added-score-float {
                animation: reducedAddedScoreFade calc(3.5s * var(--anim-factor)) ease-out forwards;
            }

            .overlay-fade-in {
                animation: reducedFadeIn calc(1.0s * var(--anim-factor)) ease-out forwards;
            }

            .overlay-fade-out {
                animation: reducedFadeOut calc(0.6s * var(--anim-factor)) ease-in-out forwards;
            }

            .rainbow-border::before,
            .gradient-blue-border::before,
            .gradient-pink-border::before,
            .gradient-orange-border::before,
            .gradient-emerald-border::before {
                animation: none !important;
            }

            @keyframes reducedFadeIn {
                from { opacity: 0; }
                to   { opacity: 1; }
            }

            @keyframes reducedAddedScoreFade {
                0%   { opacity: 0; }
                15%  { opacity: 1; }
                70%  { opacity: 1; }
                100% { opacity: 0; }
            }

            @keyframes reducedFadeOut {
                from { opacity: 1; }
                to   { opacity: 0; }
            }
        }
```

(`@keyframes` inside `@media` is valid CSS.)

Note `.position-slide { animation: none; }` intentionally lets rows snap to their new rank
instantly — removing the position change is the correct reduced behavior. The JS failsafe from
plan 001 (if applied) makes the promise still settle; without plan 001 the `animationend`
would not fire, which is why step 2 below removes the JS dependency entirely when reduce is on.

**2. JS** — skip the slide machinery altogether under reduced motion so no code waits on an
animation that never runs. Add next to the existing helpers at
`public/overlay/index.html:535-539` (right after the `animMs` function):

```js
        // OSのモーション低減設定（アニメーション距離をゼロに近づける）
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Then in `animateRankingChange`, guard the slide-setup branch at
`public/overlay/index.html:1266`:

```js
                if (!prefersReducedMotion && currentPos !== undefined && newPos !== undefined && Math.abs(currentPos - newPos) > 1) {
```

Everything else in `animateRankingChange` stays; with the guard closed,
`slidePromises` stays empty, `Promise.all` resolves immediately, and `renderScoreList` draws
the final order directly.

## Repo conventions to follow

- The GUI's own reduced-motion block is the house style exemplar
  (`src/renderer/src/assets/main.css:390-400`): blanket `animation/transition` damping with a
  Japanese explanatory comment. The overlay needs finer control (keep feedback), hence the
  per-class overrides here.
- Comments are Japanese.
- Speed-scaled durations use `calc(<base>s * var(--anim-factor))` — mirror each original
  animation's base duration exactly (0.6s slide-in, 3.5s added-score, 1.0s fade-in, 0.6s
  fade-out).

## Steps

1. Append the `@media (prefers-reduced-motion: reduce)` block above into the `<style>`
   section, after the `:root` rule (~line 495).
2. Add the `prefersReducedMotion` const right after the `animMs` function (~line 539).
3. Add the `!prefersReducedMotion &&` guard to the slide-setup condition in
   `animateRankingChange` (~line 1266).
4. No other edits. Do not "simplify" by deleting the original keyframes — they remain the
   default path for users without the OS setting.

## Boundaries

- Do NOT touch flash/glow/count-up animations (`enhancedGreenFlash`, `mkw-score-flash`,
  `countUpPulse`, `currentPlayerPulseMKW`) — brightness feedback stays under reduce.
- Do NOT remove or modify the original keyframes or their default `animation:` declarations.
- Do NOT change MKW-theme-specific layout rules (`.theme-mkw ...` selectors other than the
  border freeze listed above).
- Do NOT add new dependencies.
- If the quoted anchors do not match what you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: none (static HTML); if run, `pnpm build` still succeeds.
- **Feel check** (Chrome DevTools → Rendering → emulate `prefers-reduced-motion: reduce`,
  reload the overlay):
  - Initial load: rows fade in (opacity only), no slide-from-right, no staggered lateral
    motion.
  - Rank swap: rows snap to final positions immediately; scores still count up with glow.
  - Overall update: board crossfades via opacity only — no scale/tilt.
  - "+N" floats appear in place and fade out — no upward drift or rotation.
  - Own-team rainbow/gradient border is static; score-change flash still pulses brightly.
  - Turn the emulation OFF and confirm the original full-motion playback returns unchanged.
- **Done when**: under emulated reduce there is no translate/scale/rotate/background-position
  motion anywhere in the overlay, while flashes, glows and count-ups still provide feedback.
