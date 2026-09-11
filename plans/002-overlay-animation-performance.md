# 002 — Overlay animation performance: drop `transition: all`, drive count-up with rAF

- **Status**: DONE (executed & reviewed at commit 7854ed0; full `pnpm build` green)
- **Commit**: 7854ed0
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file (`public/overlay/index.html`), ~40 lines changed

## Problem

Two performance issues in `public/overlay/index.html`:

**A. `transition: all` in two places.**

`public/overlay/index.html:1163` — every team row is generated with the Tailwind classes
`transition-all duration-200` (compiles to `transition-property: all`). The only property that
ever transitions on a row is `opacity` (the absent-player dim set at
`public/overlay/index.html:944`: `row.style.opacity = isAbsent ? '0.45' : ''`). `all` makes any
accidental property change animate on the CPU instead of compositing.

```html
                            <div class="${isMKW ? 'h-9' : 'h-12'} flex items-center gap-1 px-2 border-0 rounded-lg transition-all duration-200 cursor-pointer relative"
```

`public/overlay/index.html:179-183` — the counting text has `transition: all 0.1s ease`, but
neither of its changed properties (`font-weight`, `text-shadow`) meaningfully interpolates
(`font-weight` steps discretely; `text-shadow` appears from nothing). The declaration is dead
weight and a hazard:

```css
        .counting-text {
            font-weight: 700;
            text-shadow: 0 0 4px var(--score-effect-color-rgba, rgba(34, 197, 94, 0.6));
            transition: all 0.1s ease;
        }
```

**B. Count-up runs on `setInterval(16)` instead of `requestAnimationFrame`.**
`public/overlay/index.html:1394-1396`:

```js
                // アニメーションを開始
                const intervalId = setInterval(updateScore, 16); // 約60fps
                countUpAnimations.set(teamName, intervalId);
```

Timers fire unevenly under OBS load and burst-catch-up after lag spikes (values stay correct —
progress uses `Date.now()` — but visible steps get chunky). rAF syncs to the compositor.

## Target

**A1** — row class list at `public/overlay/index.html:1163`; replace only the two transition
tokens:

```html
                            <div class="${isMKW ? 'h-9' : 'h-12'} flex items-center gap-1 px-2 border-0 rounded-lg transition-[opacity] duration-200 cursor-pointer relative"
```

This works with the overlay Tailwind build because `public/overlay/index.html` is scanned
literally (`tailwind.overlay.config.js:10`: `content: ['./public/overlay/index.html']`) —
`transition-[opacity]` must appear as this literal string, which it now does.

**A2** — delete the `transition` line from `.counting-text` (`public/overlay/index.html:182`):

```css
        .counting-text {
            font-weight: 700;
            text-shadow: 0 0 4px var(--score-effect-color-rgba, rgba(34, 197, 94, 0.6));
        }
```

**B** — replace the whole driver section of `animateCountUp`
(`public/overlay/index.html:1344-1413`) so that cancellation callbacks are stored in
`countUpAnimations` instead of interval ids. Full target function:

```js
        // カウントアップアニメーション関数
        function animateCountUp(element, startValue, endValue, duration = 1000) {
            return new Promise((resolve) => {
                const teamName = element.getAttribute('data-team');

                // 既存のアニメーションがあれば停止
                if (countUpAnimations.has(teamName)) {
                    countUpAnimations.get(teamName)();
                }

                const startTime = Date.now();
                const difference = endValue - startValue;

                // スコア要素内のテキスト要素を取得
                const scoreTextElement = element.querySelector('span');

                if (!scoreTextElement) {
                    resolve();
                    return;
                }

                // カウントアップ中の視覚効果を追加
                element.classList.add('score-counting-up');
                scoreTextElement.classList.add('counting-text');

                let finished = false;
                const updateScore = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);

                    // イージング関数（accelerated deceleration）
                    const easeOutQuad = 1 - Math.pow(1 - progress, 2);
                    const currentValue = Math.floor(startValue + (difference * easeOutQuad));

                    // スコア要素内のテキストを更新
                    scoreTextElement.textContent = currentValue;

                    if (progress >= 1) {
                        finished = true;
                        // アニメーション完了
                        scoreTextElement.textContent = endValue;

                        // 視覚効果を削除
                        element.classList.remove('score-counting-up');
                        scoreTextElement.classList.remove('counting-text');

                        countUpAnimations.delete(teamName);
                        console.log(`Count-up animation completed for ${teamName}: ${startValue} → ${endValue}`);
                        resolve();
                    }
                    return finished;
                };

                let rafId = 0;
                let stopped = false;
                const loop = () => {
                    if (stopped || finished) return;
                    if (!updateScore()) {
                        rafId = requestAnimationFrame(loop);
                    }
                };
                const cancel = () => {
                    stopped = true;
                    cancelAnimationFrame(rafId);
                };

                // アニメーションを開始（requestAnimationFrame駆動）
                rafId = requestAnimationFrame(loop);
                countUpAnimations.set(teamName, cancel);

                // 完了時の処理（フェイルセーフ）
                setTimeout(() => {
                    cancel();
                    if (!finished) {
                        finished = true;
                        countUpAnimations.delete(teamName);

                        // 最終値を設定
                        scoreTextElement.textContent = endValue;

                        // 視覚効果を削除
                        element.classList.remove('score-counting-up');
                        scoreTextElement.classList.remove('counting-text');

                        resolve();
                    }
                }, duration + 100); // 少し余裕を持たせる
            });
        }
```

Note the removed line `const isMKW = currentTheme === 'mkw';` (was
`public/overlay/index.html:1357`) — it was unused inside this function; do not re-add it.

Three external call sites that treat map values as interval ids must be updated to call them
as cancel functions:

`public/overlay/index.html:759-762` (empty-data cleanup):

```js
                previousScores.clear();
                countUpAnimations.forEach(cancel => cancel());
                countUpAnimations.clear();
```

(replacing `countUpAnimations.forEach(id => clearInterval(id));`)

`public/overlay/index.html:1348-1351` is inside the function above already (shown in target).
There are no other `clearInterval(countUpAnimations...)` sites — verify with a search for
`clearInterval` before finishing: after this plan the only remaining `setInterval`/`clearInterval`
in the file are the config poll (`updateTheme`, line ~672) and SSE cleanup, which must stay
untouched.

## Repo conventions to follow

- Utility classes consumed by the overlay Tailwind build must appear literally in
  `public/overlay/index.html` (`tailwind.overlay.config.js:7-10` comment says exactly this).
- Japanese comments, e.g. `// 約60fps` style annotations.
- Easing math stays as-is: `easeOutQuad = 1 - Math.pow(1 - progress, 2)`
  (`public/overlay/index.html:1374`).

## Steps

1. Edit the row template literal at line ~1163: change `transition-all duration-200` →
   `transition-[opacity] duration-200`.
2. Delete the `transition: all 0.1s ease;` line from `.counting-text` (~line 182).
3. Replace the entire `animateCountUp` function with the target version above.
4. Update the empty-data cleanup (~line 761) to
   `countUpAnimations.forEach(cancel => cancel());`.
5. Search the file for remaining occurrences of `clearInterval` — expect exactly two left:
   one for `countUpAnimations`… none; the survivors should be the theme-poll `setInterval`
   (line ~672) and none other touching `countUpAnimations`. If any
   `clearInterval(countUpAnimations.get(...))` remains, convert it the same way.
6. Run `npm run build:overlay` (regenerates `public/overlay/tailwind.css`) or `pnpm build`,
   and confirm the built CSS contains `.transition-\[opacity\]`.

## Boundaries

- Do NOT change the count-up duration value (1000 ms stays hardcoded here — speed-setting
  integration is a separate, unselected finding).
- Do NOT touch MKW-theme CSS, flash keyframes, slide logic, or `processScoreData`.
- Do NOT add new dependencies.
- Do NOT modify `src/renderer` or anything outside `public/overlay/index.html`
  (plus regenerated `public/overlay/tailwind.css` via the build script).
- If the quoted code does not match what you find, STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` completes successfully; `grep 'transition-\[opacity\]'
  public/overlay/tailwind.css` finds the utility; no `transition: all` remains anywhere in
  `public/overlay/index.html`.
- **Feel check** (open the overlay preview and trigger score changes):
  - Absent players still fade smoothly to ~45% opacity over 200 ms (not instant).
  - Score count-ups look identical: fast start, gentle settle, exact final value, glow pulse
    during counting still appears and disappears.
  - Trigger updates back-to-back quickly: numbers never freeze mid-count and never show a
    stale intermediate value after completion.
- **Done when**: `transition: all` is gone, the count-up loop is rAF-driven with callable
  cancels, and playback is visually indistinguishable from before.
