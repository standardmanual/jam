Pill-shaped button in three variants — all borderless (no stroke buttons in this system): primary filled, secondary soft-fill, ghost text-only — for two surfaces (light/dark backgrounds).

```jsx
<Button variant="primary">드랍하러 가기</Button>
<Button variant="secondary">취소</Button>
<Button variant="ghost">더보기 →</Button>
```

Use `surface="dark"` when placed on a `--color-bg-inverse` (black) section. `fullWidth` stretches to container width. Minimum touch target 44px per iOS HIG.

`size="sm"` (`44px * var(--scale-compact)`, ≈31px — token in `tokens/motion.css`) is an explicit exception to the 44px rule — use it only inside a fixed-height dense context (e.g. a navigation bar) where a full 44px control would overflow the bar. Default is `size="md"` (44px).

```jsx
<Button variant="secondary" size="sm">동기화</Button>
```
