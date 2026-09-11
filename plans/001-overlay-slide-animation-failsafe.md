# 001 — Add failsafe timeout to rank-change slide promises

- **Status**: DONE (executed & reviewed at commit 7854ed0; full `pnpm build` green)
- **Commit**: 7854ed0
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 1 file (`public/overlay/index.html`), ~20 lines changed

## Problem

The rank-change animation in `public/overlay/index.html` waits for each sliding row's
`animationend` event with a bare promise. If an `animationend` never fires (the element is
removed from the DOM mid-animation, e.g. by a concurrent re-render from the preview-mode
postMessage path, which calls `processScoreData` directly and bypasses the `isUpdateBusy`
guard), the promise never settles.

Consequence: `await Promise.all([...slidePromises, ...countUpAnimations])` hangs forever,
`isUpdateBusy` stays `true`, and every subsequent SSE notification only sets
`pendingScoreRefresh = true` — **the live overlay silently stops updating until the page is
manually refreshed**.

`public/overlay/index.html:1272-1278` — current code:

```js
                    slidePromises.push(new Promise(resolve => {
                        element.addEventListener('animationend', () => {
                            element.style.transform = `translateY(${deltaY}px)`;
                            element.classList.remove('position-slide');
                            resolve();
                        }, { once: true });
                    }));
```

`public/overlay/index.html:1314-1315` — where it hangs:

```js
            triggerCountUp();
            await Promise.all([...slidePromises, ...countUpAnimations]);
```

The count-up animation already has the correct pattern — a failsafe timeout that force-finishes
state. Exemplar at `public/overlay/index.html:1398-1411`:

```js
                // 完了時の処理（フェイルセーフ）
                setTimeout(() => {
                    clearInterval(intervalId);
                    countUpAnimations.delete(teamName);

                    // 最終値を設定
                    scoreTextElement.textContent = endValue;

                    // 視覚効果を削除
                    element.classList.remove('score-counting-up');
                    scoreTextElement.classList.remove('counting-text');

                    resolve();
                }, duration + 100); // 少し余裕を持たせる
```

## Target

Every slide promise settles either on `animationend` **or** after a timeout, whichever comes
first. The timeout performs the identical finalization (snap to final `transform`, remove the
`position-slide` class) so state is consistent no matter how it settled.

The slide animation duration is `calc(0.6s * var(--anim-factor))`
(`public/overlay/index.html:455`). The codebase scales JS waits with the configured speed via
`animMs()` (`public/overlay/index.html:536-539`):

```js
        function animMs(baseMs) {
            const speed = (window.animSettings && window.animSettings.speed) || 1;
            return Math.max(16, baseMs / speed);
        }
```

So the timeout is `animMs(600) + 400` (base duration scaled by speed, plus a fixed 400 ms
buffer for slow frames).

Replacement for `public/overlay/index.html:1272-1278`:

```js
                    slidePromises.push(new Promise(resolve => {
                        // フェイルセーフ付き完了待ち。animationend が欠落しても
                        // （要素の再描画・除去などで）タイムアウトで必ず解決し、
                        // isUpdateBusy が永久ロックされるのを防ぐ。
                        const failSafeMs = animMs(600) + 400;
                        let settled = false;
                        const finish = () => {
                            if (settled) return;
                            settled = true;
                            element.style.transform = `translateY(${deltaY}px)`;
                            element.classList.remove('position-slide');
                            resolve();
                        };
                        element.addEventListener('animationend', finish, { once: true });
                        setTimeout(finish, failSafeMs);
                    }));
```

## Repo conventions to follow

- JS waits that must track the user-configurable animation speed use `animMs(baseMs)`
  (`public/overlay/index.html:536-539`); raw `setTimeout(..., N)` is only used when the wait is
  deliberately speed-independent.
- Failsafe-after-promise is the established pattern — imitate
  `public/overlay/index.html:1398-1411` (count-up), including the Japanese comment style.
- Comments in this file are Japanese; keep new comments in Japanese.

## Steps

1. Open `public/overlay/index.html` and locate the promise push inside
   `animateRankingChange` (lines 1272–1278 at commit 7854ed0).
2. Replace the bare `new Promise(resolve => { element.addEventListener('animationend', ...) })`
   with the `finish()` / failsafe version shown in **Target** above. Keep everything else in
   `animateRankingChange` untouched.
3. Do nothing to the post-`Promise.all` cleanup block
   (`elementMap.forEach((element) => { element.style.removeProperty('transform'); ... })`,
   lines 1320–1323) — it still runs after all promises settle.

## Boundaries

- Do NOT touch `animateCountUp`, `renderScoreList`, `processScoreData`, or any CSS.
- Do NOT change the preview-mode postMessage handler or the `isUpdateBusy` logic — the
  failsafe alone removes the permanent-stall failure mode; widening scope risks regressions.
- Do NOT add new dependencies (this is a plain script tag, no build step).
- If line numbers drift more than ±30 lines or the quoted code does not match what you find,
  STOP and report instead of improvising.

## Verification

- **Mechanical**: none required beyond manual review (this page has no typecheck/build); the
  surrounding project still passes `pnpm typecheck` (it does not parse this HTML file).
- **Feel check** (serve the app with `pnpm dev`, open the overlay URL with `?preview=true` in
  the GUI preview, and drive scores):
  - Trigger a rank swap and confirm rows slide and land exactly as before — the happy path is
    byte-for-byte identical timing (`animationend` still wins).
  - Simulate a lost event: in DevTools, run
    `EventTarget.prototype.removeEventListener` is impractical here — instead temporarily set
    `failSafeMs` to 100 and confirm rows snap to their final positions and subsequent score
    updates still arrive (no frozen board), then restore `animMs(600) + 400`.
  - Rapid-fire two overall updates back to back and confirm the second update renders (queue
    drains) rather than the board going permanently stale.
- **Done when**: no code path can leave a slide promise unsettled longer than
  `animMs(600) + 400` ms, and normal rank-change playback is visually unchanged.
