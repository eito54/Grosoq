# Animation Improvement Plans

Source: `improve-animations` audit of the score overlay (`public/overlay/index.html`) at
commit `7854ed0`. Plans are self-contained; any agent can execute them without context.

## Plans

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Overlay slide animation failsafe](001-overlay-slide-animation-failsafe.md) | HIGH | DONE |
| 002 | [Overlay animation performance (transition-all → opacity, setInterval → rAF)](002-overlay-animation-performance.md) | MEDIUM | DONE |
| 003 | [Respect `prefers-reduced-motion` in the overlay](003-overlay-reduced-motion.md) | LOW-MEDIUM | DONE |

## Reviewer verdict (001 + 002 execution)

**APPROVED.** Diffs match both plans exactly; mechanical checks green
(`pnpm typecheck`, overlay Tailwind build, full `pnpm build`;
`transition-[opacity]` present in built CSS; zero `clearInterval(countUpAnimations…)`
remaining; failsafe `animMs(600) + 400` in the slide promise). Live feel-checks (preview
drive) still pending — see each plan's Verification section.

## 003 execution (2026-09-12)

Executed per plan: `@media (prefers-reduced-motion: reduce)` block appended after the
`:root` rule; `prefersReducedMotion` const after `animMs`; `!prefersReducedMotion &&`
guard added to the slide-setup condition in `animateRankingChange`. No other edits.
Mechanical checks green (`pnpm typecheck`, full `pnpm build`, inline script
syntax-checked). Live feel-check (Chrome DevTools reduce emulation) still pending.

Known pre-existing edge, not a regression: a stale count-up failsafe timer firing within
~1.1 s of a replacement count-up on the same team can overwrite the live value and delete the
new cancel entry. Identical behavior existed before plan 002. Optional follow-up: guard the
failsafe with `countUpAnimations.get(teamName) === cancel` before finalizing.

## Unselected findings (not planned)

- Count-up duration ignores the animation-speed setting (`animMs(1000)` integration)
- Easing/duration token consolidation + dead `@keyframes currentPlayerPulse`
- Remaining-races chip micro-transition; own-team border color transition

Re-run the audit or ask to plan any of these individually.
