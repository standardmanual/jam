Pill-shaped button in five variants — primary (`--accent`), secondary (`--default`), danger (`--danger`), outline (transparent + 1px `--field-border`), ghost (text-only `--link`) — for two surfaces (light/dark backgrounds). Every variant carries a 1px border (transparent except outline), so switching variants never changes the height (md = 52px).

```jsx
<Button variant="primary">드랍하러 가기</Button>
<Button variant="secondary">취소</Button>
<Button variant="danger">삭제</Button>
<Button variant="outline">필터</Button>
<Button variant="ghost">더보기 →</Button>
```

One primary per area, everything else secondary. A primary + secondary pair sits in a footer as two equal-width buttons with a gap of 8. `danger` keeps `--foreground` text (white text is 3.57:1, below 4.5:1). Do not put a `secondary` button on a `Card tone="tint"` (`--background-secondary`) — it is the same #e9e7e0 as `--default`, so the pill disappears.

Use `surface="dark"` only when placed on a `--background-inverse` (black) section — primary is a `--snow` fill with `--foreground` text, secondary is a transparent pill with a 1px `--snow` border and `--snow` text, ghost text is `--snow`. `danger` and `outline` have no dark value and fall back to the light one. On a light surface (`--background`, `--surface`) keep the default `surface="light"`; `dark` there makes the text near-white and unreadable. `fullWidth` stretches to container width. Minimum touch target 44px per iOS HIG.

`size="sm"` (`44px * var(--scale-compact)`, ≈31px — token in `tokens/motion.css`) is an explicit exception to the 44px rule — use it only inside a fixed-height dense context (e.g. a navigation bar) where a full 44px control would overflow the bar. Default is `size="md"` (44px).

```jsx
<Button variant="secondary" size="sm">동기화</Button>
```
